#!/bin/bash
set -e

echo "Starting ZestHealth Backend Deployment to GCP Cloud Run..."

PROJECT_ID="zesthealth-prod"
REGION="asia-south1" # e.g. Mumbai for India DPDP Act compliance
SERVICE_NAME="zesthealth-backend"
IMAGE_URL="gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Build and Push Docker image
echo "Building Docker image..."
docker build -t $IMAGE_URL -f backend/Dockerfile .
docker push $IMAGE_URL

# Deploy to Cloud Run, fetching secrets from GCP Secret Manager
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_URL \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-secrets="DATABASE_URL=projects/$PROJECT_ID/secrets/db_url:latest,\
REDIS_URL=projects/$PROJECT_ID/secrets/redis_url:latest,\
ENCRYPTION_KEY=projects/$PROJECT_ID/secrets/encryption_key:latest,\
JWT_SECRET=projects/$PROJECT_ID/secrets/jwt_secret:latest,\
TWILIO_SID=projects/$PROJECT_ID/secrets/twilio_sid:latest,\
TWILIO_AUTH_TOKEN=projects/$PROJECT_ID/secrets/twilio_auth_token:latest,\
FCM_SERVER_KEY=projects/$PROJECT_ID/secrets/fcm_server_key:latest" \
  --set-env-vars="NODE_ENV=production"

echo "Deployment successful!"
