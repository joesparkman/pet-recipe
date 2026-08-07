# Import the required libraries for AWS service interaction and JSON processing.
import boto3
import json

# Connect to Amazon Bedrock.
bedrock = boto3.client("bedrock-runtime")

# Define a list of pet dictionaries.
pets = [
    {"name": "Buddy", "type": "dog", "age": 3, "description": ""},
    {"name": "Mittens", "type": "cat", "age": 5, "description": ""},
    {"name": "Lucky", "type": "dog", "age": 6, "description": ""}
]
