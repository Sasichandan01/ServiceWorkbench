import sys
import boto3
import requests
from bs4 import BeautifulSoup
import re
import json
import gzip
import time
from urllib.parse import urljoin
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from awsglue.job import Job
from pyspark.context import SparkContext
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from datetime import datetime, timezone, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)



class DynamoDBExportGlueJob:
    def __init__(self, dynamodb_table_prefix, s3_export_bucket_name, s3_export_prefix,
                 bedrock_knowledge_base_id, bedrock_data_source_id, wait_for_sync,
                 aws_region, aws_account_id, job_name):
        self.dynamodb_client = boto3.client('dynamodb', region_name=aws_region)
        self.bedrock_agent_client = boto3.client('bedrock-agent', region_name=aws_region)
        self.s3_client = boto3.client('s3', region_name=aws_region)
        self.dynamodb_table_prefix = dynamodb_table_prefix
        self.s3_export_bucket_name = s3_export_bucket_name
        self.s3_export_prefix = s3_export_prefix.strip('/')
        self.bedrock_knowledge_base_id = bedrock_knowledge_base_id
        self.bedrock_data_source_id = bedrock_data_source_id.split('|')[-1]
        self.wait_for_sync = wait_for_sync
        self.aws_region = aws_region
        self.aws_account_id = aws_account_id
        self.job_name = job_name
        # self.processed_data_folder_name = processed_data_folder_name
        self.aws_partition = self.dynamodb_client.meta.partition

    def get_dynamodb_tables_with_prefix(self, prefix):
        table_names = []
        paginator = self.dynamodb_client.get_paginator('list_tables')
        response_iterator = paginator.paginate()
        for page in response_iterator:
            for table_name in page.get('TableNames', []):
                if table_name.startswith(prefix):
                    table_names.append(table_name)
        return table_names

    def find_data_folders_recursively(self, base_prefix):
        """
        Recursively find all 'data' folders under the given S3 prefix
        """
        data_folders = []
        paginator = self.s3_client.get_paginator('list_objects_v2')
        
        try:
            page_iterator = paginator.paginate(
                Bucket=self.s3_export_bucket_name,
                Prefix=base_prefix,
                Delimiter='/'
            )
            
            for page in page_iterator:
                # Check common prefixes (directories)
                for prefix_info in page.get('CommonPrefixes', []):
                    folder_path = prefix_info['Prefix']
                    if folder_path.rstrip('/').endswith('/data'):
                        data_folders.append(folder_path)
                    else:
                        # Recursively search in subdirectories
                        sub_data_folders = self.find_data_folders_recursively(folder_path)
                        data_folders.extend(sub_data_folders)
                        
        except Exception as e:
            logger.error(f"Error finding data folders under {base_prefix}: {e}")
            
        return data_folders
        
    def delete_s3_prefix(self, prefix):
        """
        Delete all objects under a given prefix in S3
        """
        try:
            # First list all objects under the prefix
            objects_to_delete = []
            paginator = self.s3_client.get_paginator('list_objects_v2')
            
            for page in paginator.paginate(
                Bucket=self.s3_export_bucket_name,
                Prefix=prefix
            ):
                if 'Contents' in page:
                    objects_to_delete.extend(
                        [{'Key': obj['Key']} for obj in page['Contents']]
                    )
    
            if not objects_to_delete:
                logger.info(f"No objects found under prefix: {prefix}")
                return True
    
            # Delete all objects in batches of 1000 (S3 limit)
            for i in range(0, len(objects_to_delete), 1000):
                response = self.s3_client.delete_objects(
                    Bucket=self.s3_export_bucket_name,
                    Delete={'Objects': objects_to_delete[i:i+1000]}
                )
                logger.info(f"Deleted {len(objects_to_delete[i:i+1000])} objects under {prefix}")
                
            return True
            
        except Exception as e:
            logger.error(f"Error deleting objects under {prefix}: {e}")
            return False

    def extract_and_decompress_json_gz_files(self, data_folder_path, table_name, export_timestamp):
        json_files_processed = 0
    
        try:
            organized_prefix = f"{self.s3_export_prefix}/{table_name.lower()}/{export_timestamp}/"
            table_prefix = f"{self.s3_export_prefix}/{table_name}/"
    
            paginator = self.s3_client.get_paginator('list_objects_v2')
            page_iterator = paginator.paginate(
                Bucket=self.s3_export_bucket_name,
                Prefix=data_folder_path
            )
    
            for page in page_iterator:
                for obj in page.get('Contents', []):
                    key = obj['Key']
    
                    if key.endswith('.json.gz'):
                        try:
                            filename = key.split('/')[-1]
                            json_filename = filename.replace('.json.gz', '.json')
                            dest_key = f"{organized_prefix}{json_filename}"
    
                            logger.info(f"Downloading and decompressing: {key}")
                            response = self.s3_client.get_object(
                                Bucket=self.s3_export_bucket_name,
                                Key=key
                            )
    
                            compressed_data = response['Body'].read()
                            decompressed_data = gzip.decompress(compressed_data)
    
                            self.s3_client.put_object(
                                Bucket=self.s3_export_bucket_name,
                                Key=dest_key,
                                Body=decompressed_data,
                                ContentType='application/json'
                            )
    
                            json_files_processed += 1
                            logger.info(f"Decompressed and uploaded: {key} -> {dest_key}")
    
                        except self.s3_client.exceptions.NoSuchKey:
                            logger.warning(f"Key not found (skipped): {key}")
                            continue
                        except Exception as inner_e:
                            logger.error(f"Error processing key {key}: {inner_e}")
                            continue
    
            #  Delete the original table export structure *after* processing
            deleted = self.delete_s3_prefix(table_prefix)
            logger.info(f"Deleted original table export folder: {table_prefix} -> {deleted}")
    
        except Exception as e:
            logger.error(f"Error extracting and decompressing JSON.gz files from {data_folder_path}: {e}")
    
        return json_files_processed

    def organize_exported_data(self, table_name, export_timestamp):
        """
        Find data folders recursively and organize JSON.gz files by decompressing them
        """
        logger.info(f"Organizing exported data for table: {table_name}")
        
        # Base path for this table's export
        table_export_prefix = f"{self.s3_export_prefix}/{table_name}"
        
        # Find all data folders recursively
        data_folders = self.find_data_folders_recursively(table_export_prefix)
        
        if not data_folders:
            logger.warning(f"No data folders found for table {table_name} under {table_export_prefix}")
            return 0
            
        logger.info(f"Found {len(data_folders)} data folders for table {table_name}: {data_folders}")
        
        total_files_processed = 0
        
        # Process each data folder
        for data_folder in data_folders:
            logger.info(f"Processing data folder: {data_folder}")
            files_processed = self.extract_and_decompress_json_gz_files(data_folder, table_name, export_timestamp)
            total_files_processed += files_processed
            
        logger.info(f"Total JSON.gz files processed for table {table_name}: {total_files_processed}")
        
        delete_ddb_folder=self.delete_s3_prefix(f"{table_export_prefix}/AWSDynamoDB/")
        
        print(delete_ddb_folder)
        
        return total_files_processed

    def run_export_and_ingestion(self):
        logger.info(f"DynamoDB Export: Discovering tables with prefix: {self.dynamodb_table_prefix}")
        matching_tables = self.get_dynamodb_tables_with_prefix(self.dynamodb_table_prefix)

        if not matching_tables:
            logger.info(f"DynamoDB Export: No tables found with prefix: {self.dynamodb_table_prefix}.")
            return

        logger.info(f"DynamoDB Export: Found {len(matching_tables)} tables: {', '.join(matching_tables)}")

        current_export_to_time = datetime.now(timezone.utc) - timedelta(minutes=5) 
        logger.info(f"DynamoDB Export: Initiating FULL exports for all tables as of: {current_export_to_time}.")

        export_jobs_to_monitor = []

        for table_name in matching_tables:
            logger.info(f"DynamoDB Export: Initiating export for table: {table_name}")
            try:
                export_tag_time_str = datetime.now().strftime("%Y%m%d-%H%M%S")
                # Modified to match DynamoDB export structure with /data at the end
                s3_export_path_for_table = f"{self.s3_export_prefix}/{table_name}"

                logger.info(f"DynamoDB Export: Performing FULL export for {table_name} to s3://{self.s3_export_bucket_name}/{s3_export_path_for_table}")
                response = self.dynamodb_client.export_table_to_point_in_time(
                    TableArn=f"arn:{self.aws_partition}:dynamodb:{self.aws_region}:{self.aws_account_id}:table/{table_name}",
                    S3Bucket=self.s3_export_bucket_name,
                    S3Prefix=s3_export_path_for_table,
                    ExportType='FULL_EXPORT',
                    ExportFormat='DYNAMODB_JSON'
                    
                )
                
                export_arn = response['ExportDescription']['ExportArn']
                export_status = response['ExportDescription']['ExportStatus']
                actual_export_time = response['ExportDescription']['ExportTime']
                
                export_jobs_to_monitor.append({
                    'Table': table_name, 
                    'ExportArn': export_arn, 
                    'Status': export_status,
                    'ExportTime': actual_export_time
                })
                logger.info(f"DynamoDB Export: Export for {table_name} started. ARN: {export_arn}, Status: {export_status}, Export Time: {actual_export_time}")

            except Exception as e:
                logger.error(f"DynamoDB Export ERROR: Failed to initiate export for table {table_name}: {e}")

        if not export_jobs_to_monitor:
            logger.warning("DynamoDB Export WARNING: No DDB export jobs were initiated successfully for any tables.")
        else:
            logger.info("DynamoDB Export: Monitoring DynamoDB export jobs...")
            max_export_retries = 120
            export_retry_interval_seconds = 30
            all_exports_completed = False

            for i in range(max_export_retries):
                all_exports_completed = True
                for job_info in export_jobs_to_monitor:
                    if job_info['Status'] not in ['COMPLETED', 'FAILED']:
                        try:
                            response = self.dynamodb_client.describe_export(ExportArn=job_info['ExportArn'])
                            current_status = response['ExportDescription']['ExportStatus']
                            job_info['Status'] = current_status
                            
                            # Get additional export details
                            export_time = response['ExportDescription']['ExportTime']
                            s3_bucket = response['ExportDescription']['S3Bucket']
                            s3_prefix = response['ExportDescription']['S3Prefix']
                            
                            logger.info(f"DynamoDB Export: Export for {job_info['Table']} (ARN: {job_info['ExportArn']}) status: {current_status}, Export Time: {export_time}")
                            
                            # Log completion details
                            if current_status == 'COMPLETED':
                                logger.info(f"DynamoDB Export: Export for {job_info['Table']} completed successfully. Data exported to s3://{s3_bucket}/{s3_prefix}")
                            elif current_status == 'FAILED':
                                failure_reason = response['ExportDescription'].get('FailureMessage', 'No failure message available')
                                logger.error(f"DynamoDB Export ERROR: Export for {job_info['Table']} {current_status.lower()}. Reason: {failure_reason}")
                            
                            if current_status not in ['COMPLETED', 'FAILED']:
                                all_exports_completed = False
                        except Exception as e:
                            logger.error(f"DynamoDB Export ERROR: Could not describe export {job_info['ExportArn']}: {e}")
                            all_exports_completed = False
                
                if all_exports_completed:
                    logger.info("DynamoDB Export: All DynamoDB exports have completed or failed their monitoring period.")
                    break
                else:
                    logger.info(f"DynamoDB Export: Waiting for exports to complete... (Attempt {i+1}/{max_export_retries})")
                    time.sleep(export_retry_interval_seconds)

            if not all_exports_completed:
                logger.warning("DynamoDB Export WARNING: DynamoDB exports did not complete within the maximum retry limit.")

            failed_exports = [job for job in export_jobs_to_monitor if job['Status'] in ['FAILED', 'STOPPED']]
            if failed_exports:
                logger.warning(f"DynamoDB Export WARNING: {len(failed_exports)} DynamoDB exports failed or were cancelled. Details: {failed_exports}")
            else:
                logger.info("DynamoDB Export: All initiated DynamoDB exports completed successfully.")

        # Organize exported data after all exports complete
        if export_jobs_to_monitor:
            logger.info("DynamoDB Export: Starting data organization process...")
            total_organized_files = 0
            
            for job_info in export_jobs_to_monitor:
                if job_info['Status'] == 'COMPLETED':
                    table_name = job_info['Table']
                    export_time = job_info['ExportTime']
                    export_timestamp = export_time.strftime("%Y%m%d-%H%M%S")
                    
                    # Wait a bit for S3 eventual consistency
                    time.sleep(10)
                    
                    files_organized = self.organize_exported_data(table_name, export_timestamp)
                    total_organized_files += files_organized
                    
            logger.info(f"DynamoDB Export: Data organization completed. Total files processed: {total_organized_files}")
        else:
            logger.info("DynamoDB Export: No exports to organize.")

        logger.info("DynamoDB Export: Attempting to trigger Bedrock Knowledge Base ingestion job...")
        try:
            response = self.bedrock_agent_client.start_ingestion_job(
                knowledgeBaseId=self.bedrock_knowledge_base_id,
                dataSourceId=self.bedrock_data_source_id
            )
            ingestion_job_id = response['ingestionJob']['ingestionJobId']
            logger.info(f"DynamoDB Export: Bedrock ingestion job started with ID: {ingestion_job_id}")

            if self.wait_for_sync:
                max_ingestion_retries = 60
                ingestion_retry_interval_seconds = 30
                ingestion_job_status = None

                for i in range(max_ingestion_retries):
                    time.sleep(ingestion_retry_interval_seconds)
                    get_job_response = self.bedrock_agent_client.get_ingestion_job(
                        knowledgeBaseId=self.bedrock_knowledge_base_id,
                        dataSourceId=self.bedrock_data_source_id,
                        ingestionJobId=ingestion_job_id
                    )
                    ingestion_job_status = get_job_response['ingestionJob']['status']
                    logger.info(f"DynamoDB Export: Ingestion job status: {ingestion_job_status} (Attempt {i+1}/{max_ingestion_retries})")

                    if ingestion_job_status in ['COMPLETE','STOPPED','FAILED']:
                        break
                
                if ingestion_job_status == 'COMPLETE':
                    logger.info("DynamoDB Export: Knowledge base ingestion completed successfully.")
                else:
                    logger.error(f"DynamoDB Export ERROR: Knowledge base ingestion failed with status: {ingestion_job_status}.")
            else:
                logger.info("DynamoDB Export: WAIT_FOR_SYNC is false. Not waiting for Bedrock ingestion job completion.")

        except Exception as e:
            logger.error(f"DynamoDB Export ERROR: Failed to trigger or monitor Bedrock KB sync: {e}")

        logger.info("DynamoDB Export: Process completed.")



class WebScraperGlueJob:
    def __init__(self, s3_bucket, s3_prefix, kb_id, ds_id, job_name, region):
        self.s3_client = boto3.client('s3')
        self.bedrock_agent_client = boto3.client('bedrock-agent', region_name=region)
        self.s3_bucket = s3_bucket
        self.s3_prefix = s3_prefix
        self.job_name = job_name
        self.kb_id = kb_id
        self.kb_ds_id = ds_id.split('|')[-1]
        self.region = region
        self.session = requests.Session()
        self.visited = set()
        self.lock = Lock()
        self.stats = {'processed': 0, 'skipped': 0, 'failed': 0}
        self.failed_urls = []
        self.max_urls_per_batch = 1000
        self.max_total_urls = 10000
        
        self.BLOCKLIST_TOKENS = {"faq", "pricing", "release-notes", "cli", "sdk", "history", ".previous", ".next"}
        self.SERVICES = {"apigateway", "cloudformation", "dynamodb", "glue", "iam", "lambda", "s3", "ses", "sns", "sqs", "stepfunctions"}
        self.MAX_WORKERS = 20
        
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
    
    def clean_s3_data(self):
        logger.info(f"Web Scraper: Cleaning S3 data from s3://{self.s3_bucket}/{self.s3_prefix}")
        
        try:
            paginator = self.s3_client.get_paginator('list_objects_v2')
            if self.s3_prefix:
                pages = paginator.paginate(Bucket=self.s3_bucket, Prefix=self.s3_prefix)
            else:
                pages = paginator.paginate(Bucket=self.s3_bucket)
            
            objects_to_delete = []
            for page in pages:
                if 'Contents' in page:
                    for obj in page['Contents']:
                        objects_to_delete.append({'Key': obj['Key']})
            
            if objects_to_delete:
                for i in range(0, len(objects_to_delete), 1000):
                    batch = objects_to_delete[i:i+1000]
                    response=self.s3_client.delete_objects(
                        Bucket=self.s3_bucket,
                        Delete={'Objects': batch}
                    )
                    logger.info(f"Web Scraper: Response:{response}")
                    logger.info(f"Web Scraper: Deleted batch of {len(batch)} objects")
                
                logger.info(f"Web Scraper: Successfully deleted {len(objects_to_delete)} objects")
            else:
                logger.info("Web Scraper: No objects found to delete")
                
        except Exception as e:
            logger.error(f"Web Scraper ERROR: Error cleaning S3 data: {str(e)}")
            raise
    
    def should_follow(self, url: str, domain: str, allowed_prefixes: dict) -> bool:
        if not allowed_prefixes.get(domain):
            return False
            
        if not any(url.startswith(pref) for pref in allowed_prefixes[domain]):
            return False
        
        if domain != "boto3" and any(tok in url for tok in self.BLOCKLIST_TOKENS):
            return False
        elif domain == "boto3" and any(tok in url for tok in (self.BLOCKLIST_TOKENS - {"cli"})):
            return False
        
        if domain == "cft":
            if not any(service in url.lower() for service in self.SERVICES):
                return False
        
        return url.lower().endswith(".html")
    
    def url_to_txt_s3_key(self, url: str, domain: str) -> str:
        key = url.replace("https://", "").replace("/", "_")
        if not key.endswith(".txt"):
            key += ".txt"
        
        if self.s3_prefix:
            return f"{self.s3_prefix}/{domain}/{key}"
        else:
            return f"{domain}/{key}"
    
    def check_if_already_processed(self, url: str, domain: str) -> bool:
        try:
            txt_key = self.url_to_txt_s3_key(url, domain)
            self.s3_client.head_object(Bucket=self.s3_bucket, Key=txt_key)
            return True
        except self.s3_client.exceptions.NoSuchKey:
            return False
        except Exception as e:
            logger.warning("Web Scraper WARNING: Error checking if %s is processed: %s", url, e)
            return False
    
    def find_main_container(self, soup: BeautifulSoup):
        main = soup.select_one("#main-col-body") or soup.find("main") or soup.find("article")
        if main:
            return main
        candidates = soup.find_all("div")
        return max(candidates, key=lambda d: len(d.get_text(strip=True)), default=soup.body)
    
    def extract_and_clean(self, html: str) -> str:
        soup = BeautifulSoup(html, "html.parser")
        
        for selector in ["script", "style", "header", "nav", "footer", ".breadcrumb", ".awsdocs-filter-selector"]:
            for tag in soup.select(selector):
                tag.decompose()
        
        main = self.find_main_container(soup)
        raw = main.get_text(separator="\n").strip()
        
        raw = raw.replace(u"\u00A0", " ")
        no_extra_spaces = re.sub(r"[ \t]+", " ", raw)
        lines = [ln.strip() for ln in no_extra_spaces.splitlines() if ln.strip()]
        
        return "\n".join(lines)
    
    def crawl_url(self, url: str, domain: str, allowed_prefixes: dict, urls_to_crawl: list):
        with self.lock:
            if url in self.visited:
                return
            self.visited.add(url)
        
        if self.check_if_already_processed(url, domain):
            logger.info("Web Scraper: Skipping already processed URL %s", url)
            with self.lock:
                self.stats['skipped'] += 1
            return
        
        try:
            resp = self.session.get(url, timeout=10)
            resp.raise_for_status()
        except Exception as e:
            logger.error("Web Scraper ERROR: Failed to fetch %s: %s", url, e)
            with self.lock:
                self.stats['failed'] += 1
                self.failed_urls.append(url)
            return
        
        try:
            html = resp.text
            clean_text = self.extract_and_clean(html)
            
            txt_key = self.url_to_txt_s3_key(url, domain)
            self.s3_client.put_object(
                Bucket=self.s3_bucket,
                Key=txt_key,
                Body=clean_text.encode("utf-8"),
                ContentType="text/plain"
            )
            
            logger.info("Web Scraper: Processed %s -> txt: %s", url, txt_key)
            with self.lock:
                self.stats['processed'] += 1
            
            soup = BeautifulSoup(html, "html.parser")
            for a in soup.find_all("a", href=True):
                full = urljoin(url, a["href"])
                if self.should_follow(full, domain, allowed_prefixes):
                    with self.lock:
                        if full not in self.visited and len(self.visited) < self.max_total_urls:
                            urls_to_crawl.append((full, domain))
            
        except Exception as e:
            logger.error("Web Scraper ERROR: Error processing %s: %s", url, e)
            with self.lock:
                self.failed_urls.append(url)
                self.stats['failed'] += 1
    
    def process_urls(self, urls_to_process: dict, allowed_prefixes: dict):
        if not urls_to_process:
            logger.error("Web Scraper ERROR: No URLs configured to process")
            return {'processed': 0, 'skipped': 0, 'failed': 0}
        
        urls_to_crawl = []
        for domain, url_list in urls_to_process.items():
            for url in url_list:
                urls_to_crawl.append((url, domain))
        
        batch_size = self.max_urls_per_batch
        batch_count = 0
        max_batches = 50
        
        logger.info(f"Web Scraper: Starting to process {len(urls_to_crawl)} URLs")
        
        while urls_to_crawl and batch_count < max_batches:
            batch_count += 1
            current_batch = urls_to_crawl[:batch_size]
            urls_to_crawl = urls_to_crawl[batch_size:]
            
            logger.info(f"Web Scraper: Processing batch {batch_count} with {len(current_batch)} URLs")
            
            with ThreadPoolExecutor(max_workers=self.MAX_WORKERS) as executor:
                new_urls = []
                futures = []
                
                for url, domain in current_batch:
                    future = executor.submit(self.crawl_url, url, domain, allowed_prefixes, new_urls)
                    futures.append(future)
                
                for future in as_completed(futures):
                    try:
                        future.result()
                    except Exception as e:
                        logger.error(f"Web Scraper ERROR: Error in thread execution: {e}")
                
                if len(self.visited) < self.max_total_urls:
                    remaining_capacity = self.max_total_urls - len(self.visited)
                    urls_to_crawl.extend(new_urls[:remaining_capacity])
            
            logger.info(f"Web Scraper: Batch {batch_count} completed. Stats: {self.stats}")
            time.sleep(1)
        
        logger.info(f"Web Scraper: Processing completed. Final stats: {self.stats}")
        return self.stats
    
    def trigger_kb_ingestion(self):
        try:
            logger.info("Web Scraper: Starting knowledge base ingestion job")
            
            response = self.bedrock_agent_client.start_ingestion_job(
                knowledgeBaseId=self.kb_id,
                dataSourceId=self.kb_ds_id,
                description=f"Ingestion job triggered by Glue job {self.job_name} at {datetime.now().isoformat()}"
            )
            
            ingestion_job_id = response['ingestionJob']['ingestionJobId']
            logger.info(f"Web Scraper: Started ingestion job with ID: {ingestion_job_id}")
            
            return ingestion_job_id
        except Exception as e:
            logger.error(f"Web Scraper ERROR: Error starting KB ingestion job: {str(e)}")
            return None
    
    def monitor_ingestion_job(self, ingestion_job_id):
        try:
            logger.info(f"Web Scraper: Monitoring ingestion job: {ingestion_job_id}")
            max_wait_time = 3600
            start_time = time.time()
            
            while time.time() - start_time < max_wait_time:
                response = self.bedrock_agent_client.get_ingestion_job(
                    knowledgeBaseId=self.kb_id,
                    dataSourceId=self.kb_ds_id,
                    ingestionJobId=ingestion_job_id
                )
                
                status = response['ingestionJob']['status']
                logger.info(f"Web Scraper: Ingestion job status: {status}")
                
                if status == 'COMPLETE':
                    logger.info("Web Scraper: Ingestion job completed successfully!")
                    if 'statistics' in response['ingestionJob']:
                        stats = response['ingestionJob']['statistics']
                        logger.info(f"Web Scraper: Ingestion statistics: {json.dumps(stats, indent=2)}")
                    return True
                elif status == 'FAILED':
                    logger.error("Web Scraper ERROR: Ingestion job failed!")
                    if 'failureReasons' in response['ingestionJob']:
                        reasons = response['ingestionJob']['failureReasons']
                        logger.error(f"Web Scraper: Failure reasons: {reasons}")
                    return False
                elif status in ['STARTING', 'IN_PROGRESS']:
                    logger.info("Web Scraper: Ingestion job is still running, waiting 30 seconds...")
                    time.sleep(30)
                else:
                    logger.warning(f"Web Scraper WARNING: Unknown status: {status}")
                    time.sleep(30)
            
            logger.error("Web Scraper ERROR: Ingestion job monitoring timed out")
            return False
            
        except Exception as e:
            logger.error(f"Web Scraper ERROR: Error monitoring ingestion job: {str(e)}")
            return False
    
    def create_summary_report(self):
        summary = {
            'total_visited': len(self.visited),
            'visited_urls': list(self.visited),
            'failed_urls': self.failed_urls,
            'stats': self.stats,
            'generated_at': time.strftime('%Y-%m-%d %H:%M:%S')
        }
        
        if self.s3_prefix:
            summary_key = f"{self.s3_prefix}/summary_report.json"
        else:
            summary_key = "summary_report.json"
            
        try:
            self.s3_client.put_object(
                Bucket=self.s3_bucket,
                Key=summary_key,
                Body=json.dumps(summary, indent=2),
                ContentType='application/json'
            )
            logger.info(f"Web Scraper: Summary report uploaded to s3://{self.s3_bucket}/{summary_key}")
        except Exception as e:
            logger.error(f"Web Scraper ERROR: Error uploading summary report: {e}")
        
        return summary

def main():
    args = getResolvedOptions(sys.argv, [
        'JOB_NAME',
        'DYNAMODB_TABLE_PREFIX',
        'AURORA_KB_ID',
        'AURORA_DS_ID',
        'OPENSEARCH_KB_ID',
        'OPENSEARCH_DS_ID',
        'OPENSEARCH_S3_BUCKET',
        'OPENSEARCH_S3_PREFIX',
        'AURORA_S3_BUCKET',
        'AURORA_S3_PREFIX',
        'WAIT_FOR_SYNC',
        'AWS_REGION',
        'AWS_ACCOUNT_ID'
    ])
    
    sc = SparkContext()
    glueContext = GlueContext(sc)
    job = Job(glueContext)
    job.init(args['JOB_NAME'], args)
    
    allowed_prefixes = {
        "docs": [
            "https://docs.aws.amazon.com/lambda/latest/dg/",
            "https://docs.aws.amazon.com/AmazonS3/latest/userguide/",
            "https://docs.aws.amazon.com/apigateway/latest/developerguide/",
            "https://docs.aws.amazon.com/glue/latest/dg/",
            "https://docs.aws.amazon.com/sns/latest/dg/",
            "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/",
            "https://docs.aws.amazon.com/step-functions/latest/dg/",
            "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/",
        ],
        "cft": [
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-apigateway",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-cloudformation",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-dynamodb",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-glue",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-iam",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-lambda",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-s3",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-ses",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-sns",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-sqs",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-stepfunctions",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigateway",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cloudformation",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-dynamodb",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-glue",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-iam",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-lambda",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-s3",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ses",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-sns",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-sqs",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-stepfunctions"
        ],
        "boto3": [
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/dynamodb/",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/dynamodbstreams/",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/glue/",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/lambda/",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3/",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/ses/",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/sns/",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/sqs/",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/stepfunctions/"
        ]
    }
    
    urls_to_process = {
        "docs": [
            "https://docs.aws.amazon.com/lambda/latest/dg/welcome.html",
            "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html",
            "https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html",
            "https://docs.aws.amazon.com/glue/latest/dg/what-is-glue.html",
            "https://docs.aws.amazon.com/sns/latest/dg/welcome.html",
            "https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html",
            "https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html",
            "https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html",
            "https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html",
            "https://docs.aws.amazon.com/ses/latest/dg/Welcome.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html"
        ],
        "cft": [
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_ApiGateway.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_CloudFormation.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_DynamoDB.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_Glue.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_IAM.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_Lambda.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_S3.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_SES.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_SNS.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_SQS.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/AWS_StepFunctions.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-product-attribute-reference.html",
            "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/intrinsic-function-reference.html"
        ],
        "boto3": [
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/dynamodb.html",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/dynamodbstreams.html",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/glue.html",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/lambda.html",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/s3.html",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/ses.html",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/sns.html",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/sqs.html",
            "https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/stepfunctions.html"
        ]
    }
    try:
        logger.info("Starting DynamoDB Export process...")
        ddb_exporter = DynamoDBExportGlueJob(
            dynamodb_table_prefix=args['DYNAMODB_TABLE_PREFIX'],
            s3_export_bucket_name=args['AURORA_S3_BUCKET'],
            s3_export_prefix=args['AURORA_S3_PREFIX'],
            bedrock_knowledge_base_id=args['AURORA_KB_ID'],
            bedrock_data_source_id=args['AURORA_DS_ID'],
            wait_for_sync=True,
            aws_region=args['AWS_REGION'],
            aws_account_id=args['AWS_ACCOUNT_ID'],
            job_name=args['JOB_NAME']
        )
        web_scraper = WebScraperGlueJob(
            s3_bucket=args['OPENSEARCH_S3_BUCKET'],
            s3_prefix=args['OPENSEARCH_S3_PREFIX'],
            kb_id=args['OPENSEARCH_KB_ID'],
            ds_id=args['OPENSEARCH_DS_ID'],
            job_name=args['JOB_NAME'],
            region=args['AWS_REGION']
        )

        def run_web_scraping_and_trigger_ingestion_task():
            logger.info("Web Scraper: Starting internal process for parallel execution...")
            web_scraper.clean_s3_data()
            web_scraper.process_urls(
                urls_to_process=urls_to_process,
                allowed_prefixes=allowed_prefixes
            )
            web_scraper.create_summary_report()
            
            ingestion_job_id = web_scraper.trigger_kb_ingestion()
            logger.info(f"Web Scraper: Triggered Bedrock ingestion job with ID: {ingestion_job_id}")
            return ingestion_job_id

        with ThreadPoolExecutor(max_workers=70) as executor: 
            logger.info("Submitting DynamoDB Export and Web Scraping processes to run in parallel...")
            webscrape_future=None
            ddb_future=None
            ddb_future = executor.submit(ddb_exporter.run_export_and_ingestion)
            # webscrape_future = executor.submit(run_web_scraping_and_trigger_ingestion_task)

            monitoring_futures = []
            active_futures = [fut for fut in [ddb_future, webscrape_future] if fut is not None]
            for future in as_completed(active_futures):
                task_name = "Unknown Task"
                try:
                    if future is ddb_future:
                        task_name = "DynamoDB Export & Trigger"
                        ingestion_job_id = future.result()
                        logger.info(f"{task_name} completed. Bedrock Ingestion Job ID: {ingestion_job_id}")

                        if args['WAIT_FOR_SYNC'].lower() == 'true':
                            if ingestion_job_id:
                                logger.info(f"Submitting monitoring task for {task_name} ingestion job {ingestion_job_id}...")
                                monitoring_future = executor.submit(ddb_exporter.monitor_ingestion_job, ingestion_job_id)
                                monitoring_futures.append(monitoring_future)
                            else:
                                logger.error(f"{task_name}: Ingestion job ID was not obtained. Cannot monitor.")
                        else:
                            logger.info(f"{task_name}: WAIT_FOR_SYNC is false. Not waiting for Bedrock ingestion job completion.")

                    elif future is webscrape_future:
                        task_name = "Web Scraping & Trigger"
                        ingestion_job_id = future.result()
                        logger.info(f"{task_name} completed. Bedrock Ingestion Job ID: {ingestion_job_id}")

                        if args['WAIT_FOR_SYNC'].lower() == 'true':
                            if ingestion_job_id:
                                logger.info(f"Submitting monitoring task for {task_name} ingestion job {ingestion_job_id}...")
                                monitoring_future = executor.submit(web_scraper.monitor_ingestion_job, ingestion_job_id)
                                monitoring_futures.append(monitoring_future)
                            else:
                                logger.error(f"{task_name}: Ingestion job ID was not obtained. Cannot monitor.")
                        else:
                            logger.info(f"{task_name}: WAIT_FOR_SYNC is false. Not waiting for Bedrock ingestion job completion.")

                except Exception as exc:
                    logger.error(f"Task '{task_name}' generated an exception during main execution: {exc}", exc_info=True)
                    raise

            if args['WAIT_FOR_SYNC'].lower() == 'true' and monitoring_futures:
                logger.info("Waiting for all Bedrock ingestion monitoring tasks to complete...")
                for monitor_future in as_completed(monitoring_futures):
                    try:
                        monitor_future.result()
                        logger.info("A Bedrock ingestion monitoring task completed successfully.")
                    except Exception as exc:
                        logger.error(f"A Bedrock ingestion monitoring task failed: {exc}", exc_info=True)
                        raise
                logger.info("All Bedrock ingestion monitoring completed.")
            elif not monitoring_futures:
                logger.info("No Bedrock ingestion monitoring tasks were submitted (WAIT_FOR_SYNC is false or no IDs).")

        logger.info("Overall Glue job completed.")

    except Exception as e:
        logger.error(f"Overall Job Failed with error: {str(e)}", exc_info=True)
        raise
    finally:
        job.commit()

        

#         ddb_exporter.run_export_and_ingestion()
#         logger.info("DynamoDB Export process completed.")

#         # Web Scraping Section
#         logger.info("\nStarting Web Scraping process...")

        
#         logger.info(f"Web Scraper: Starting job with {len(urls_to_process)} domains")
#         logger.info(f"Web Scraper: Glue job: {args['JOB_NAME']}")
#         logger.info(f"Web Scraper: S3 bucket: {args['OPENSEARCH_S3_BUCKET']}")
#         logger.info(f"Web Scraper: Knowledge Base ID: {args['OPENSEARCH_KB_ID']}")
        

        
#         web_scraper.clean_s3_data()
        
#         stats = web_scraper.process_urls(
#             urls_to_process=urls_to_process,
#             allowed_prefixes=allowed_prefixes
#         )
        
#         summary = web_scraper.create_summary_report()
        
#         logger.info(f"Web Scraper: Job completed successfully. Final summary: {summary}")
        
#         try:
#             ingestion_job_id = web_scraper.trigger_kb_ingestion()
            
#             if ingestion_job_id:
#                 logger.info("Web Scraper: KB ingestion job started successfully")
#                 if args['WAIT_FOR_SYNC'].lower() == 'true':
#                     success = web_scraper.monitor_ingestion_job(ingestion_job_id)
#                     if success:
#                         logger.info("Web Scraper: All processed data successfully sent to knowledge base!")
#                     else:
#                         logger.error("Web Scraper ERROR: Ingestion job failed or timed out")
#                 else:
#                     logger.info("Web Scraper: WAIT_FOR_SYNC is false. Not waiting for Bedrock ingestion job completion.")
#             else:
#                 logger.error("Web Scraper ERROR: Failed to start knowledge base ingestion job")
                
#         except Exception as ingestion_error:
#             logger.error(f"Web Scraper ERROR: Error with KB ingestion: {str(ingestion_error)}")
#             logger.error("Web Scraper ERROR: Data was staged but KB ingestion failed")
        
#         logger.info("Web Scraper: Process completed.")
        
#         logger.info("Overall Glue job completed.")
#         return True
        
#     except Exception as e:
#         logger.error(f"Overall Job Failed with error: {str(e)}")
#         raise
#     finally:
#         job.commit()

if __name__ == "__main__":
    main()