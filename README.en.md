# Event Management Platform

A lightweight event system with a headless backend, submission form, and a custom admin panel.

The solution exists because traditional CMS platforms (e.g. Squarespace) often lack flexible control over structured event data and logic.

This acts as an external event CMS that can be consumed by any frontend.

---

## Use Case

When a website lacks a flexible data model, filtering, and custom logic for events, this project provides:
- Full control over event data
- An API for frontend rendering
- An admin panel independent of the CMS
- Safe rendering of dynamic content

Frontends can fetch data via the API and render it dynamically (e.g. in Squarespace code blocks).

---

## Stack

- Firebase Cloud Functions (Node.js)
- Firestore
- Firebase Storage
- Firebase Hosting
- Vanilla JavaScript
- HTML / CSS

---

## Functionality

### Submission (form)
- Event submission via a dedicated form
- Field, image, and logo validation
- Image upload (4:3 crop) and logo (PNG)
- reCAPTCHA v3
- Thank‑you/confirmation after submission

### Event
- Title, slug, summary, and content (body text)
- Program (time‑based schedule)
- Date and time
- Location, room, and floor
- Organizer name and URL
- Image + logo
- Price and capacity
- Registration deadline and CTA link
- Calendar export (ICS)
- Sharing
- Status: Draft / Published / Finished
- Automatic archiving the day after the event date

### API
- Fetch published events
- Fetch a single event by slug
- CORS protected
- Cache headers for faster loading

### Admin
- Login (Firebase Auth)
- Overview with search and filters
- Create, edit, delete
- Program editor
- Image/logo replacement with Storage cleanup
- Share buttons in admin
- Email recipients managed in admin

### Notifications
- Email notification on new submissions via Firebase Extensions (Trigger Email)
- HTML email with a clear summary and admin button

---

## Status

The system is in active use and covers the core needs.  
Further improvements happen continuously.
