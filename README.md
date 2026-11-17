# SRAVAN · Portfolio

A portfolio site with an admin panel. Visitors see your photo, experience timeline, and four
categories (Experience, Motion Graphics, AI Video Generation, Video Editing). You manage everything from `/admin`.

## Run it

Requires Node.js 18.18 or newer.

```bash
npm install
npm run set-admin -- <your-username> <your-password>   # at least 8 characters
npm start
```

- Site: http://localhost:3000
- Admin: http://localhost:3000/admin

Run `npm run set-admin` again any time to change the username or password.

## What you can manage (admin panel)

- **Profile & photo**: name, title, tagline, bio, and the photo shown in the centre.
- **Contacts**: WhatsApp, Instagram (add several, e.g. Personal and Work), email, phone, LinkedIn,
  YouTube, Facebook, X, website, or any other link. Each has a label and reorder arrows.
- **Categories**: add, rename, reorder, or delete. Each category has a scroll effect:
  - *Horizontal scroll row*: drag, wheel, or arrow buttons, with glossy 3D cards.
  - *Motion graphics scroll (pinned)*: the page pins and scrolls the track sideways.
  - *3D tilt on scroll*: cards tilt in 3D as they pass the middle of the screen.
  - *Grid reveal*, and *Timeline* for experience categories.
- **Photos & videos**: upload to any photo/video category with a progress bar, add a poster for videos,
  edit titles and captions, reorder, or delete.
- **Experience**: add roles with period, company, location, and description, then reorder them with arrows.
- **Feedback**: messages from visitors. Tick **Show on site** to feature a message in the
  "Client feedback" section. Email addresses are never shown publicly.

## Where things live

- `data/site.json`: all content and the hashed admin password. Back this file up.
- `uploads/`: photos and videos. Back this folder up.
- Both are created on first run and are git-ignored.

## Tests

```bash
npm test
```

## Notes

- Uploads accept jpg, png, webp, gif, mp4, webm, mov, and m4v, up to 1 GB each.
- Sign-in is rate limited (8 attempts per 15 minutes per IP). Sessions last 8 hours.
- Set `COOKIE_SECURE=1` when serving over HTTPS. Set `PORT` to change the port.
- Visitors' feedback is limited to 10 messages per hour per IP.
