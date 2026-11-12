pipeline {
    agent any

    environment {
        IMAGE_NAME = 'clinic-web'
        CONTAINER_NAME = 'clinic-web-app'
        APP_PORT = '5078'
    }

    stages {
        stage('Checkout Code') {
            steps {
                echo 'Checking out code...'
            }
        }

        stage('Build Docker Image') {
            steps {
                echo 'Building Docker Image...'
                sh 'docker build -t ${IMAGE_NAME}:latest .'
            }
        }

        stage('Stop Old Container') {
            steps {
                echo 'Stopping existing container if running...'
                sh '''
                    docker stop ${CONTAINER_NAME} || true
                    docker rm ${CONTAINER_NAME} || true
                '''
            }
        }

        stage('Deploy Container') {
            steps {
                echo 'Starting new container...'
                sh '''
                    docker run -d --name ${CONTAINER_NAME} \
                        -p ${APP_PORT}:${APP_PORT} \
                        -e ASPNETCORE_URLS=http://+:${APP_PORT} \
                        -e ASPNETCORE_ENVIRONMENT=Development \
                        ${IMAGE_NAME}:latest
                '''
            }
        }

        stage('Health Check') {
            steps {
                echo 'Verifying deployment...'
                sh 'sleep 3 && docker ps | grep ${CONTAINER_NAME}'
            }
        }
    }

    post {
        success {
            echo "Pipeline succeeded! Application is running at http://localhost:${APP_PORT}"
        }
        failure {
            echo "Pipeline failed! Please check logs."
        }
    }
}
