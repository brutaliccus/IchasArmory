# Deployment Script Fixes - Port 6100 Release Issue

## Problem
Service restarts were failing because port 6100 wasn't being released quickly enough, causing the restart to hang.

## Solution
Added retry logic with exponential backoff and aggressive port cleanup to all deployment scripts.

## Updated Scripts

### 1. `deploy_from_windows.sh`
- **Added**: Retry logic (up to 5 attempts)
- **Added**: Port cleanup before each retry
- **Added**: Service status verification after start
- **Added**: Better error messages with log command

### 2. `watch_and_deploy.sh`
- **Added**: Same retry logic for auto-deployments
- **Added**: Port cleanup in deploy function
- **Added**: Exponential backoff between retries

### 3. `quick_deploy.sh`
- **Added**: Retry logic for quick deployments
- **Added**: Port cleanup
- **Added**: Silent operation (minimal output)

### 4. `ensure_port_free.sh` (NEW)
- Helper script for RPI-side port management
- Can be integrated into `start_service.sh`
- Waits up to 30 seconds for port to be released
- Force kills processes if needed

## How It Works

1. **Port Cleanup**: Before each restart attempt, the script:
   - Finds any process using port 6100 (`lsof -ti:6100`)
   - Force kills it (`kill -9`)
   - Stops the systemd service
   - Waits 1 second

2. **Retry Logic**:
   - Up to 5 attempts
   - Exponential backoff: 2s, 4s, 8s, 16s, 32s
   - Verifies service is actually running after start

3. **Verification**:
   - Checks `systemctl is-active` after start
   - Only reports success if service is confirmed active

## Usage

### Normal Deployment
```bash
./deploy_from_windows.sh
```

### Quick Deploy (minimal output)
```bash
./quick_deploy.sh
```

### Auto-Deploy (watches for changes)
```bash
./watch_and_deploy.sh
```

## Integration with start_service.sh

If you want to add port checking to your RPI-side `start_service.sh`, you can add this at the beginning:

```bash
#!/bin/bash
# Ensure port is free before starting
cd "$(dirname "$0")"
./ensure_port_free.sh 6100 30

# Then start your service normally
python3 server.py &
```

Or inline:
```bash
#!/bin/bash
PORT=6100
MAX_WAIT=30

# Kill any process on port
PID=$(sudo lsof -ti:$PORT 2>/dev/null || echo '')
if [ -n "$PID" ]; then
    echo "Killing process $PID on port $PORT..."
    sudo kill -9 $PID 2>/dev/null || true
    sleep 1
fi

# Rest of your start script...
```

## Troubleshooting

If deployments still fail:

1. **Check service logs**:
   ```bash
   ssh freitagpihole@192.168.68.76 'sudo journalctl -u ehp-calculator -n 50'
   ```

2. **Check port manually**:
   ```bash
   ssh freitagpihole@192.168.68.76 'sudo lsof -i:6100'
   ```

3. **Manual cleanup**:
   ```bash
   ssh freitagpihole@192.168.68.76 'sudo systemctl stop ehp-calculator && sudo pkill -f server.py && sleep 2 && sudo systemctl start ehp-calculator'
   ```

4. **Increase retry count**: Edit the scripts and change `MAX_RETRIES=5` to a higher number

## Notes

- The scripts use `lsof` which should be available on most Linux systems
- If `lsof` is not available, install it: `sudo apt-get install lsof`
- The force kill (`kill -9`) is aggressive but necessary for stuck processes
- Exponential backoff prevents hammering the system with restart attempts

