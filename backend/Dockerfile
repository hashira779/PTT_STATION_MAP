# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install the Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code (app.py) into the container
COPY . .

# Make port 5000 available outside the container
EXPOSE 7000

# The command to run when the container starts
CMD ["python", "app.py"]