# Deployment Guide for IchaCalc

## Quick Deploy (One Command)

After making changes on your Windows machine:

```bash
./deploy_from_windows.sh
```

This will:
1. Transfer files to your RPI (excluding node_modules, .git, etc.)
2. Stop the service gracefully
3. Wait for the port to be released
4. Start the service
5. Verify it started successfully

## Setup Instructions

### 1. First-Time Setup on Windows

Edit `deploy_from_windows.sh` and update these variables:
```bash
RPI_USER="pi"              # Your RPI username
RPI_HOST="192.168.1.100"   # Your RPI IP address
RPI_PATH="/var/www/IchaCalc"  # Where the app lives on RPI
```

Make the script executable (in Git Bash):
```bash
chmod +x deploy_from_windows.sh
```

### 2. First-Time Setup on RPI

SSH into your RPI and edit `deploy.sh`:
```bash
SERVICE_NAME="your-service-name"  # e.g., "ichacalc" or "node-app"
PORT=3000                          # Your app's port
```

Make it executable:
```bash
chmod +x deploy.sh
```

### 3. Install rsync on Windows (Optional but Recommended)

For faster deployments, install rsync via Git Bash or WSL. If not available, the script will fall back to scp.

## Manual Deployment Steps

If you prefer to deploy manually:

### Option A: Using WinSCP
1. Upload changed files to RPI
2. SSH into RPI
3. Run: `sudo bash /var/www/IchaCalc/deploy.sh`

### Option B: Using Command Line
```bash
# Transfer files
scp -r /c/dev/IchaCalc/* pi@192.168.1.100:/var/www/IchaCalc/

# SSH and restart
ssh pi@192.168.1.100
cd /var/www/IchaCalc
sudo bash deploy.sh
```

## Troubleshooting

### Port Still in Use After 30 Seconds
The script will automatically force-kill processes on the port. If this happens frequently:

1. Check for zombie processes:
```bash
ps aux | grep node
```

2. Increase `MAX_WAIT` in `deploy.sh`

### Service Fails to Start
Check the logs:
```bash
sudo journalctl -u your-service-name -n 50
```

### Permission Issues
Ensure deploy.sh has proper permissions:
```bash
sudo chmod +x /var/www/IchaCalc/deploy.sh
```

## Advanced: Git-Based Deployment

For even better workflow, consider setting up Git:

```bash
# On Windows
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/ichacalc.git
git push -u origin main

# On RPI
cd /var/www/IchaCalc
git pull origin main
sudo bash deploy.sh
```

Then your deployment becomes:
```bash
git add .
git commit -m "Your changes"
git push
ssh pi@rpi "cd /var/www/IchaCalc && git pull && sudo bash deploy.sh"
```
