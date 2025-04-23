import requests
import sys

def get_orcid_profile(orcid_id):
    """
    Retrieve the ORCID profile of a given author.
    """
    url = f"https://pub.orcid.org/v3.0/{orcid_id}/person"
    headers = {"Accept": "application/json"}
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json()
    return None

def extract_name_from_profile(profile):
    """
    Extracts the full name from the ORCID profile.
    """
    try:
        given = profile["name"]["given-names"]["value"]
        family = profile["name"]["family-name"]["value"]
        return f"{given} {family}"
    except (KeyError, TypeError):
        return None

def search_semantic_scholar(name):
    """
    Search Semantic Scholar using the author's full name.
    """
    url = f"https://api.semanticscholar.org/graph/v1/author/search?query={name}&limit=5&fields=name,paperCount,url"
    response = requests.get(url)
    return response.json() if response.status_code == 200 else None

def search_pubmed_by_name(name):
    """
    Search PubMed by author name.
    """
    query = name.replace(" ", "+")
    url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={query}[Author]&retmode=json"
    response = requests.get(url)
    return response.json() if response.status_code == 200 else None

def search_pubmed_by_orcid(orcid_id):
    """
    Search PubMed by ORCID ID.
    """
    url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={orcid_id}[aid]&retmode=json"
    response = requests.get(url)
    return response.json() if response.status_code == 200 else None

def summarize_results(orcid_profile, sem_data, pubmed_by_name, pubmed_by_orcid):
    print("\n===== SUMMARY =====")

    name_found = extract_name_from_profile(orcid_profile) if orcid_profile else None
    print(f"ORCID profile found: {'Yes' if orcid_profile else 'No'}")
    print(f"Name from ORCID: {name_found if name_found else 'Not found'}")

    sem_match = sem_data and sem_data.get("total", 0) > 0
    print(f"Semantic Scholar match: {'Yes' if sem_match else 'No'}")

    pubmed_match_name = pubmed_by_name and int(pubmed_by_name.get("esearchresult", {}).get("count", 0)) > 0
    pubmed_match_orcid = pubmed_by_orcid and int(pubmed_by_orcid.get("esearchresult", {}).get("count", 0)) > 0

    print(f"PubMed match by name: {'Yes' if pubmed_match_name else 'No'}")
    print(f"PubMed match by ORCID: {'Yes' if pubmed_match_orcid else 'No'}")

    confidence_score = sum([orcid_profile is not None, sem_match, pubmed_match_name or pubmed_match_orcid])
    confidence = {
        3: "High",
        2: "Medium",
        1: "Low",
        0: "None"
    }[confidence_score]

    print(f"Overall verification confidence: {confidence}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python orcid_lookup.py <orcid_id>")
        sys.exit(1)

    orcid_id = sys.argv[1]
    print(f"Verifying ORCID ID: {orcid_id}")

    orcid_profile = get_orcid_profile(orcid_id)
    name = extract_name_from_profile(orcid_profile) if orcid_profile else None

    if not name:
        print("Could not extract name from ORCID profile.")
        sys.exit(1)

    print("\n=== ORCID PROFILE ===")
    print(orcid_profile)

    print("\n=== SEMANTIC SCHOLAR ===")
    sem_data = search_semantic_scholar(name)
    print(sem_data if sem_data else "Semantic Scholar query failed.")

    print("\n=== PUBMED (by name) ===")
    pubmed_by_name = search_pubmed_by_name(name)
    print(pubmed_by_name if pubmed_by_name else "PubMed name query failed.")

    print("\n=== PUBMED (by ORCID) ===")
    pubmed_by_orcid = search_pubmed_by_orcid(orcid_id)
    print(pubmed_by_orcid if pubmed_by_orcid else "PubMed ORCID query failed.")

    summarize_results(orcid_profile, sem_data, pubmed_by_name, pubmed_by_orcid)
