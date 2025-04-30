"""Implementation of automated moderator"""

from typing import List
import pandas as pd
from atproto import Client
from PIL import Image
import imagehash
import requests
from io import BytesIO

T_AND_S_LABEL = "t-and-s"
DOG_LABEL = "dog"
THRESH = 0.25

class AutomatedLabeler:
    """Automated labeler implementation"""

    def __init__(self, client: Client, input_dir):
        self.client = client

        # Milestone 2
        self.ts_words = self._load_csv_words(f"{input_dir}/t-and-s-words.csv")
        self.ts_domains = self._load_csv_words(f"{input_dir}/t-and-s-domains.csv")

        # Milestone 3
        self.news_domains = self._load_news_domains(f"{input_dir}/news-domains.csv")

        # Milestone 4
        self.dog_hashes = self._load_dog_reference_hashes(f"{input_dir}/dog-list-images")

    # Milestone 2 methods
    def _load_csv_words(self, filepath: str) -> List[str]:
        df = pd.read_csv(filepath, header=0)
        # Only take the first column, strip and lower
        return df.iloc[:, 0].dropna().str.lower().str.strip().tolist()

    def _fetch_post_text(self, url: str) -> str:
        try:
            post_id = url.split("/post/")[-1]
            handle = url.split("/profile/")[1].split("/post/")[0]

            # Resolve the handle to its DID
            did = self.client.com.atproto.identity.resolve_handle({"handle": handle}).did

            post_uri = f"at://{did}/app.bsky.feed.post/{post_id}"

            # Fetch post using DID
            resp = self.client.app.bsky.feed.get_posts({"uris": [post_uri]})
            posts = getattr(resp, "posts", [])
            if not posts:
                raise ValueError(f"No posts returned for URI: {post_uri}")

            return posts[0].record.text.lower()
        except Exception as e:
            print(f"Error fetching post text for {url}: {e}")
            return ""

    # Milestone 3 methods
    def _load_news_domains(self, filepath: str) -> dict:
        df = pd.read_csv(filepath)
        return {row["Domain"].lower().strip(): row["Source"].strip() for _, row in df.iterrows()}

    def _detect_news_sources(self, text: str) -> List[str]:
        found_labels = set()
        for domain, label in self.news_domains.items():
            if domain in text:
                found_labels.add(label)
        return list(found_labels)

    # Milestone 4 methods
    def _load_dog_reference_hashes(self, folder: str) -> List[imagehash.ImageHash]:
        import os
        hashes = []
        for filename in os.listdir(folder):
            if filename.lower().endswith((".jpg", ".jpeg", ".png")):
                path = os.path.join(folder, filename)
                try:
                    with Image.open(path) as img:
                        hashes.append(imagehash.phash(img))
                except Exception as e:
                    print(f"Failed to hash {filename}: {e}")
        return hashes

    def _contains_dog_image(self, url: str) -> bool:
        try:
            post_id = url.split("/post/")[-1]
            handle = url.split("/profile/")[1].split("/post/")[0]
            did = self.client.com.atproto.identity.resolve_handle({"handle": handle}).did
            post_uri = f"at://{did}/app.bsky.feed.post/{post_id}"

            resp = self.client.app.bsky.feed.get_posts({"uris": [post_uri]})
            posts = getattr(resp, "posts", [])
            if not posts:
                return False

            post = posts[0]
            embed = getattr(post, "embed", None)
            if not embed or not hasattr(embed, "images"):
                return False

            for img in embed.images:
                img_url = img.fullsize
                response = requests.get(img_url)
                if response.status_code != 200:
                    continue

                with Image.open(BytesIO(response.content)) as im:
                    post_hash = imagehash.phash(im)
                    for ref_hash in self.dog_hashes:
                        if post_hash - ref_hash <= THRESH * len(post_hash.hash) ** 2:
                            return True

            return False
        except Exception as e:
            print(f"Error processing images from {url}: {e}")
            return False

    # Moderate Post
    def moderate_post(self, url: str) -> List[str]:
        print(f"Checking post: {url}")
        txt = self._fetch_post_text(url)
        labels = []

        # Milestone 2: Trust & Safety
        if any(w in txt for w in self.ts_words):
            print("Matched T&S keyword.")
            labels.append(T_AND_S_LABEL)
        elif any(d in txt for d in self.ts_domains):
            print("Matched T&S domain.")
            labels.append(T_AND_S_LABEL)

        # Milestone 3: News Sources
        news_labels = self._detect_news_sources(txt)
        if news_labels:
            print(f"Matched news sources → {news_labels}")
        labels.extend(news_labels)

        # Milestone 4: Woof or Meow
        if self._contains_dog_image(url):
            print("Detected dog image.")
            labels.append(DOG_LABEL)

        print(f"Final label: {labels}")
        return labels
