# Import the required libraries for AWS service interaction and JSON processing.
import boto3
import json

# Connect to Amazon Bedrock.
bedrock = boto3.client("bedrock-runtime")
