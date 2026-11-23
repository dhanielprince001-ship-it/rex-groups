# Rex Groups

A responsive React + Vite + TypeScript starter website for Rex Groups.

## Run locally
1. Install Node.js.
2. In this project folder, run `npm install`.
3. Run `npm run dev`.
4. Open the local URL shown by Vite.

## Deploy
Push this project to GitHub and import the repository into Vercel. Use:
- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`

## Important notes
- The contact form opens the visitor's email application using a prefilled message. It does not save enquiries to a database.
- Portfolio entries are demonstration concepts, not claims of completed client work.
- Contact details, social links, services, projects and process steps are all defined at the top of `src/App.tsx`.
- Social icons only appear once you add a real URL to the `SOCIALS` list in `src/App.tsx`.
- The theme (dark/light) follows the visitor's system setting and is remembered between visits.
- Sign-in uses Firebase Authentication (email/password and Google popup). A database, payments and the future Rex Groups Business OS are separate development stages.

## Firebase setup
1. Copy `.env.example` to `.env` and fill in the six `VITE_FIREBASE_*` values.
2. In Firebase Console > Authentication > Sign-in method, enable Email/Password and Google.
3. In Authentication > Settings > Authorized domains, add your Vercel domain (and any custom domain).
4. On Vercel, add the same variables under Project Settings > Environment Variables and redeploy.
