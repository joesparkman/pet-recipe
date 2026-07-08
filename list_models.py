import boto3

# Initialize Bedrock client
client = boto3.client("bedrock", region_name="us-east-1") 

print("Fetching available models...")
# List available models
response = client.list_foundation_models(byOutputModality='TEXT')

for model in response['modelSummaries']:
    print(f"Model ID: {model['modelId']}")