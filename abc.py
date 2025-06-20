"""
This module demonstrates a simple greeting function that prints a message and a large number.
"""

def greet(name):
    """
    This function takes a name as input and prints a greeting message.
    It also prints a large number for fun.
    """
    big_number = 10 ** 100
    print(f"HELLO, {name.upper()}!!!")
    print(f"Here's a big number for you: {big_number}")

if __name__ == "__main__":
    greet("World")
