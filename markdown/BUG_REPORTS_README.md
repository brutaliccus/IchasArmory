# Bug Report System

## Starting the Server

To enable bug report submissions, you need to run the local server:

```bash
npm start
```

This will start the server on `http://localhost:3000`

## How It Works

1. **User Submission**: Users click the bug icon (top-left) and fill out the form
2. **Data Collected**:
   - Title (optional)
   - Description (required)
   - Contact info (optional)
   - Screenshot (optional, max 5MB)
   - Automatic: timestamp, user agent, current URL

3. **Storage**: Each bug report is saved in `bug-reports/[timestamp]/`:
   - `report.json` - Contains all text data
   - `screenshot.png/jpg/etc` - Screenshot if provided

## Reviewing Bug Reports

Bug reports are saved to: `C:\dev\IchaCalc\bug-reports\`

Each report directory is timestamped (e.g., `2026-01-05T12-30-45-123Z/`)

### Example report.json:
```json
{
  "title": "Stats not updating",
  "description": "When I equip a new item, the stats don't update until I refresh",
  "contact": "discord:username#1234",
  "timestamp": "2026-01-05T12:30:45.123Z",
  "userAgent": "Mozilla/5.0...",
  "url": "http://localhost:3000/index.html",
  "screenshot": "screenshot.png"
}
```

## Deployment Notes

For production (Raspberry Pi at 192.168.68.76):
1. Copy `server.js` to the Pi
2. Install dependencies: `npm install`
3. Run with PM2 or similar: `pm2 start server.js --name ichacalc`
4. Configure nginx to proxy to port 3000
5. Bug reports will save to `/path/to/ichacalc/bug-reports/`

## Security Considerations

- File size limited to 5MB
- Only image files accepted for screenshots
- No authentication required (adjust if needed for production)
- Bug reports directory excluded from git (.gitignore)
