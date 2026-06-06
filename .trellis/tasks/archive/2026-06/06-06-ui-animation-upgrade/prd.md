# UI Animation Upgrade And Startup Screen

## Goal

Upgrade the app's first impression and core UI motion without changing existing product workflows.

## Requirements

- Add a startup overlay that plays once after the React app mounts.
- The startup overlay begins with `Your point is great!`.
- The opening phrase is replaced by scrambled glyphs, dissolves outward as particles, then reveals `Now it's mine`.
- Add interactive motion to primary shell interactions: navigation hover/tap states, active navigation movement, and page transitions.
- Add subtle interaction motion to reusable point/stat surfaces where it improves feedback.
- Make the motion feel more advanced by borrowing GSAP-style ideas: split-text reveals, scramble-text decoding, shared-element/Flip-like active states, and masked sweep effects.
- Keep the advanced motion GPU-friendly: prefer transform, opacity, and layout animation; avoid canvas, WebGL, per-frame pointer tracking, and new animation dependencies.
- During Explore file import/analysis, split the source text into preview information blocks and present a centered processing stage: the block currently being generated stays vertically centered, receives a light sweep/glow, completed blocks reveal a star, and the stage advances block-by-block until analysis finishes.
- The Explore processing stage must use its own front-end animation queue so that fast or bursty backend chunk events cannot skip directly from the first processing state to the full completed list.
- After Explore analysis finishes, reveal generated result cards one-by-one in source order instead of mounting the full result list all at once.
- Keep existing routing, stores, API calls, and user data behavior unchanged.

## Constraints

- Use the existing `framer-motion` dependency for animation.
- Use Tailwind tokens and existing theme variables for styling.
- Do not introduce new animation libraries or backend changes.
- Respect reduced-motion users by shortening or simplifying motion when possible.
- Do not add always-on computation-heavy animations to the main app shell.

## Success Criteria

- Startup sequence plays and automatically dismisses to the existing app.
- Navigation and page changes feel animated but remain readable and stable.
- Explore analysis shows a centered active information block while processing and advances one block at a time even if backend chunk events arrive in a burst.
- Explore result cards appear sequentially after processing completes.
- Existing pages still render and build succeeds with `npm run build`.
