# Event Management Platform

A simple event management system with a headless backend and a custom admin interface.

The platform was created to solve a common limitation in CMS-based websites:  
when the built-in CMS does not provide a flexible or open enough solution for structured event data.

This system acts as an external event CMS that can be consumed by any frontend.

---

## Use Case

Some website builders (such as Squarespace) offer limited control over structured content, filtering, and custom logic.

This project provides:
- Full control over event data
- A clean API for frontend rendering
- A custom admin interface independent of the CMS
- Safe rendering of dynamic content

The frontend can fetch events via the API and render them dynamically, while content is managed separately.

---

## Stack

- Firebase Cloud Functions (Node.js)
- Firestore
- Vanilla JavaScript
- HTML / CSS

---

## Functionality

### Events
- Title, slug, summary, and content
- Program (time-based schedule)
- Date and time (start / end)
- Location details
- Organizer (internal / external)
- Image per event
- Price and capacity
- Registration deadline
- Call-to-action link
- Calendar export (ICS)
- Social sharing
- Status:
  - Draft
  - Published
  - Archived

### API
- Fetch all published events
- Fetch single event by slug
- Sorted by upcoming date
- Optional filtering

### Admin
- Event overview with status-based coloring
- Search and filters
- Create, edit, and delete events
- Program editor
- Split edit layout (content / metadata)

---

## Status

Core functionality is implemented.  
Further improvements and refinements are planned.

