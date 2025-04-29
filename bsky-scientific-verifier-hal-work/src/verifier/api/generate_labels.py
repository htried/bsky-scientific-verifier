import json
import sys
import os
import requests

'''
Labels generated will be:
- emerging researcher if fewer than 10 publications (more than 1)
- researcher if more than 10 publications
- field of latest publication
- latest journal
'''

def load_verification_summary(orcid_id):
    # Load the verification summary JSON from /data
    filepath = f"src/data/verification_summary_{orcid_id}.json"
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        sys.exit(1)
    with open(filepath, "r") as f:
        return json.load(f)

def generate_labels(summary):
    labels = []

    # Researcher / Emerging Researcher based on number of publications
    num_pubs = summary.get("orcid_num_publications", 0)
    if num_pubs >= 10:
        labels.append("researcher")
    elif num_pubs > 0:
        labels.append("emerging-researcher")

    # Active Researcher based on recent publication year
    most_recent_year = summary.get("most_recent_pubmed_year")
    if most_recent_year is not None:
        from datetime import datetime
        current_year = datetime.now().year
        if current_year - most_recent_year <= 5:
            labels.append("active")

    # Field-based label
    field = summary.get("most_recent_pubmed_field")
    if field and field.lower() != "unknown":
        formatted_field = field.lower().replace(" ", "-")
        labels.append(f"latest field:{formatted_field}")

    # Journal-based label
    journal = summary.get("most_recent_pubmed_journal")
    if journal:
        formatted_journal = journal.lower().replace(" ", "-").replace(":", "").replace(".", "")
        labels.append(f"latest journal:{formatted_journal}")

    return labels

def prepare_labels(did, uri, labels):
    payload = {
        "labels": []
    }
    for label in labels:
        payload["labels"].append({
            "src": did,
            "uri": uri,
            "val": label
        })
    return payload

def post_labels(payload, access_token):
    url = "https://bsky.social/xrpc/com.atproto.label.subscribeLabels"  # or another endpoint Hal gives you
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }
    response = requests.post(url, headers=headers, json=payload)

    if response.status_code == 200:
        print("Labels posted successfully!")
    else:
        print(f"Error posting labels: {response.status_code} {response.text}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python generate_labels.py <orcid_id>")
        sys.exit(1)

    orcid_id = sys.argv[1]
    summary = load_verification_summary(orcid_id)
    labels = generate_labels(summary)

    print(f"\nLabels for {orcid_id}: {labels}")
