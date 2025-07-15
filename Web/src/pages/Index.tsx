import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Shield, Database, Cloud, BarChart3, Users, Cog, Zap, Globe, HardDrive, Mail, MessageSquare, Bell, Workflow, Shuffle, Code, Layers } from "lucide-react";
import { Link } from "react-router-dom";

const Index = () => {
  const features = [{
    icon: Cloud,
    title: "Workspace Management",
    description: "Provision and manage isolated, cloud-based workspaces with lifecycle operations."
  }, {
    icon: Database,
    title: "Data Source Management",
    description: "Create and manage data sources with seamless workspace integration."
  }, {
    icon: Shield,
    title: "Access Control & Identity",
    description: "Enterprise-grade IAM and RBAC with AWS Cognito and SSO integration."
  }, {
    icon: BarChart3,
    title: "Cost Tracking & Optimization",
    description: "Track costs at job, user, and project levels with AI-powered optimization."
  }, {
    icon: Users,
    title: "Internal Marketplace",
    description: "Secure sharing of data products between teams without data duplication."
  }, {
    icon: Cog,
    title: "ETL Job Management",
    description: "Define, schedule, and execute ETL jobs with real-time monitoring."
  }];

  const awsServices = [
    {
      name: "Lambda",
      description: "Serverless compute functions",
      color: "bg-orange-500",
      icon: Zap
    },
    {
      name: "API Gateway",
      description: "RESTful API management",
      color: "bg-purple-500",
      icon: Code
    },
    {
      name: "S3",
      description: "Object storage service",
      color: "bg-green-500",
      icon: Database
    },
    {
      name: "DynamoDB",
      description: "NoSQL database service",
      color: "bg-blue-500",
      icon: Layers
    },
    {
      name: "SQS",
      description: "Message queuing service",
      color: "bg-yellow-500",
      icon: MessageSquare
    },
    {
      name: "SNS",
      description: "Notification service",
      color: "bg-red-500",
      icon: Bell
    },
    {
      name: "SES",
      description: "Email service",
      color: "bg-indigo-500",
      icon: Mail
    },
    {
      name: "Glue",
      description: "ETL data processing service",
      color: "bg-teal-500",
      icon: Shuffle
    },
    {
      name: "Step Functions",
      description: "Serverless workflow orchestration",
      color: "bg-pink-500",
      icon: Workflow
    }
  ];

  const whyChooseFeatures = [{
    icon: "⚡",
    title: "Lightning Fast",
    description: "Generate complete AWS architectures in seconds using our supported services: Glue, Lambda, Step Functions, Bedrock Flows, and SQS."
  }, {
    icon: "🛡️",
    title: "Best Practices",
    description: "Every solution follows AWS Well-Architected Framework principles for security, reliability, and cost optimization."
  }, {
    icon: "💻",
    title: "Production Ready",
    description: "Get Infrastructure as Code, deployment scripts, and documentation ready for immediate implementation."
  }];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Navigation */}
      <nav className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Cloud className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">Service Workbench</span>
            </div>
            <div className="flex space-x-4">
              <Link to="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link to="/signup">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Build AWS Solutions with AWS
            <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Workbench</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">Design and architect solutions using Lambda, API Gateway, S3, DynamoDB, SQS, SNS, SES, Glue and Step Functions. Simply describe your workflow, and our AI will generate the complete architecture for you.</p>
          <div className="flex justify-center space-x-4">
            <Link to="/signup">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                Start Building Now
                <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline">
              View Examples
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => <Card key={index} className="border-none shadow-lg hover:shadow-xl transition-shadow bg-white/80 backdrop-blur-sm">
              <CardHeader>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <CardTitle className="text-gray-900">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-gray-600">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>)}
        </div>
      </section>

      {/* Supported AWS Services Section */}
      <section className="py-16 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Supported AWS Services
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Build powerful solutions with our curated set of AWS services
          </p>
        </div>
        
        <div className="relative">
          <div className="flex animate-[scroll_40s_linear_infinite] space-x-6" style={{ width: 'calc(320px * 27)' }}>
            {/* Create 3 copies for seamless infinite scroll */}
            {[...Array(3)].map((_, copyIndex) => 
              awsServices.map((service, index) => (
                <div
                  key={`${copyIndex}-${index}`}
                  className="flex-shrink-0 w-80 bg-white border border-gray-200 rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow mx-3"
                >
                  <div className={`w-16 h-16 ${service.color} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                    <service.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">{service.name}</h3>
                  <p className="text-gray-600 text-center">{service.description}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Why Choose AWS Workbench Section */}
      <section className="max-w-7xl mx-auto px-6 py-16 bg-gray-50">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Why Choose AWS Workbench?
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Accelerate your cloud journey with intelligent automation
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {whyChooseFeatures.map((feature, index) => (
            <div key={index} className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl">{feature.icon}</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">{feature.title}</h3>
              <p className="text-gray-600 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            {/* Company Info */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">Service Workbench</span>
              </div>
              <p className="text-gray-400 leading-relaxed">
                Build powerful AWS solutions with intelligent automation. Design, deploy, and manage cloud architectures with ease.
              </p>
            </div>

            {/* Product */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Product</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Documentation</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">API Reference</a></li>
              </ul>
            </div>

            {/* Company */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Company</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">About Us</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Careers</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>

            {/* Support */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Support</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Community</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Status</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="border-t border-gray-800 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <div className="text-gray-400 text-sm">
                © 2025 Service Workbench. All rights reserved.
              </div>
              <div className="flex space-x-6 text-sm">
                <a href="#" className="text-gray-400 hover:text-white transition-colors">Privacy Policy</a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">Terms of Service</a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">Cookie Policy</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
