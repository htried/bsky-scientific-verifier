# Bluesky Scientific Verifier

An application that uses Vercel (frontend), AWS Lambda, and DynamoDB (backend) to verify scientists on ORCiD and add their scientific credentials and stats to Bluesky.

A Bluesky user who wants to get labels on their account indicating their scientific credentials:
1. Navigates to https://bsky-scientific-verifier.vercel.app
2. Logs in to their ORCiD account
3. The app collects, parses, and saves information from ORCiD and PubMed about that ORCiD user
4. Then, the user logs into their Bluesky account
5. Finally, the user sees a page when they can add verified labels to their account (there are also options to refresh old labels or delete labels that they no longer want to display).

A Bluesky user who wants to see those labels:
1. Navigates to bsky-sci-verify.bsky.social
2. Hits the "Subscribe to Labeler" button

At present, the actual label emitting and subscription functionality (from @skyware/labeler) have not yet been implemented (since we haven't had a test labeler). They'll be coming soon.

## License
MIT License
