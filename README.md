# Shift Tools

A small, offline web app for end-of-shift admin:

1. **Reconcile** – add up EPOS and PDF (card terminal / Z-report) totals for
   **Visa, Mastercard, Amex and Cash** and check they match to the penny.
2. **Handover** – write and send a handover email using per-room
   **preset sentence starters**, with **customisable sign-ins and sign-offs**.

No install, no server, no account. Everything is saved in your browser.

## Running it

Open `index.html` in any modern browser (double-click it). That's it.

To host it (e.g. so it works on your phone), put the folder on any static host
such as GitHub Pages, or run `npm start` to serve it locally on port 8080.

## Reconcile

- Each payment type has an **EPOS** column and a **PDF** column.
- Type a figure and press **Enter** to add another line (useful when you have
  several PDFs or terminals). Use **×** to remove a line.
- Amounts accept `12.50`, `£1,234.50`, `-3` or `(4.20)` for refunds.
- Each card turns green when it matches, red when it doesn't, and shows the
  difference (PDF − EPOS).
- The summary shows every type, a **cards subtotal** (Visa + MC + Amex) and a
  **grand total**. **Copy summary** copies it as text; **Use in handover email**
  adds it to your email.
- Figures are kept if you refresh; **Clear all** starts again.

## Handover

- Pick a **room** – its default To/CC, subject and sentence starters load in.
- Tap a **sentence starter** to drop it into your notes on a new line, then
  finish the sentence.
- Choose a **sign-in** (greeting) and **sign-off** (signature).
- Tick **Include takings reconciliation** to append the reconcile summary.
- **Open in email app** opens your default mail app with everything filled in;
  **Copy email** copies the subject and body to paste anywhere (Outlook web,
  Gmail, Teams…).

## Settings

- **Rooms** – name, default To/CC (separate addresses with `;` or `,`),
  subject template and sentence starters (one per line). Add as many rooms as
  you like.
- **Sign-ins** and **Sign-offs** – as many as you want, each with a name and
  text.
- Placeholders work in subjects, sign-ins and sign-offs:
  `{name}` `{room}` `{shift}` `{date}` `{day}`.
- **Export / Import** settings as a JSON file to back up or copy to another
  device. **Reset to defaults** restores the sample rooms and signatures.

## Development

Plain HTML/CSS/JS – no build step. Money maths lives in `calc.js` (integer
pence, no floating point errors) and is unit-tested:

```sh
npm test
```
