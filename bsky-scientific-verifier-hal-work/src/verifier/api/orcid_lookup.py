import requests
import sys
import json
import xml.etree.ElementTree as ET

'''
orcid_lookup.py

Fetch ORCID profile and PubMed metadata for a given ORCID ID.
Summarizes key data including publications and most recent PubMed article.

Usage:
    python src/verifier/api/orcid_lookup.py <orcid_id>

Example:
    python src/verifier/api/orcid_lookup.py 0000-0002-4027-364X
'''


# Fetch ORCID profile (basic author info)
def get_orcid_profile(orcid_id):
    url = f"https://pub.orcid.org/v3.0/{orcid_id}/person"
    headers = {"Accept": "application/json"}
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json()
    return None

# Extract author's full name from ORCID profile
def extract_name_from_profile(profile):
    try:
        given = profile["name"]["given-names"]["value"]
        family = profile["name"]["family-name"]["value"]
        return f"{given} {family}"
    except (KeyError, TypeError):
        return None

# Extract institution names (employment or education) from ORCID activities
def extract_verified_institution(orcid_id):
    institutions = []
    url = f"https://pub.orcid.org/v3.0/{orcid_id}/activities"
    headers = {"Accept": "application/json"}
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        data = response.json()
        for section in ["employments", "educations"]:
            for item in data.get(section, {}).get(f"{section[:-1]}-summary", []):
                org = item.get("organization", {}).get("name")
                if org:
                    institutions.append(org)
    return institutions if institutions else None

# Fetch list of publications (works) from ORCID
def fetch_orcid_works(orcid_id):
    url = f"https://pub.orcid.org/v3.0/{orcid_id}/works"
    headers = {"Accept": "application/json"}
    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        return None
    data = response.json()
    works = data.get("group", [])

    publication_years = []
    publication_types = []

    for work in works:
        work_summary_list = work.get("work-summary", [])
        if not work_summary_list:
            continue
        work_summary = work_summary_list[0]
        if not work_summary:
            continue

        # Extract publication year
        pub_date = work_summary.get("publication-date")
        if pub_date:
            year_obj = pub_date.get("year")
            if year_obj:
                year_value = year_obj.get("value")
                if year_value:
                    publication_years.append(int(year_value))

        # Extract publication type (journal article, book chapter, etc.)
        work_type = work_summary.get("type")
        if work_type:
            publication_types.append(work_type)

    return {
        "num_publications": len(works),
        "publication_years": publication_years,
        "publication_types": publication_types
    }

# Search PubMed for publications by author name
def search_pubmed_by_name(name):
    query = name.replace(" ", "+")
    url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={query}[Author]&retmode=json"
    response = requests.get(url)
    return response.json() if response.status_code == 200 else None

# Search PubMed for publications by ORCID ID
def search_pubmed_by_orcid(orcid_id):
    url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={orcid_id}[aid]&retmode=json"
    response = requests.get(url)
    return response.json() if response.status_code == 200 else None

# Fetch detailed metadata from PubMed given a list of PMIDs
def fetch_pubmed_metadata(pmid_list):
    if not pmid_list:
        return []
    ids = ",".join(pmid_list)
    url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={ids}&retmode=xml"
    response = requests.get(url)
    if response.status_code != 200:
        return []

    root = ET.fromstring(response.content)
    articles = []

    for article in root.findall(".//PubmedArticle"):
        article_info = {
            "title": article.findtext(".//ArticleTitle"),
            "journal": article.findtext(".//Journal/Title"),
            "year": int(article.findtext(".//PubDate/Year")) if article.findtext(".//PubDate/Year") else None,
            "publication_types": [ptype.text for ptype in article.findall(".//PublicationTypeList/PublicationType")],
            "mesh_terms": [mh.findtext("DescriptorName") for mh in article.findall(".//MeshHeading")]
        }
        articles.append(article_info)

    return articles

# Summarize all fetched data and save it into a JSON file
def summarize_and_save(orcid_id, orcid_profile, pubmed_by_name, pubmed_by_orcid, orcid_works_data, pubmed_metadata):
    result = {
        "orcid_id": orcid_id,
        "name": extract_name_from_profile(orcid_profile) if orcid_profile else None,
        "verified_institution": extract_verified_institution(orcid_id) if orcid_profile else None,
    }

    # ORCID works summary
    if orcid_works_data:
        years = orcid_works_data.get("publication_years", [])
        publication_types = orcid_works_data.get("publication_types", [])
        result.update({
            "orcid_num_publications": orcid_works_data.get("num_publications", 0),
            "orcid_years_active": {
                "first_publication": min(years),
                "last_publication": max(years)
            } if years else None,
            "orcid_publication_types_summary": {
                pub_type: publication_types.count(pub_type)
                for pub_type in set(publication_types)
            } if publication_types else {}
        })
    else:
        result.update({
            "orcid_num_publications": 0,
            "orcid_years_active": None,
            "orcid_publication_types_summary": {}
        })

    # PubMed match status
    pubmed_match = False
    if (pubmed_by_orcid and int(pubmed_by_orcid.get("esearchresult", {}).get("count", 0)) > 0) or \
       (pubmed_by_name and int(pubmed_by_name.get("esearchresult", {}).get("count", 0)) > 0):
        pubmed_match = True
    result["pubmed_match"] = pubmed_match

    # PubMed detailed metadata
    if pubmed_metadata:
        result["pubmed_num_publications"] = len(pubmed_metadata)

        # Find most recent publication
        most_recent_article = max(
            (a for a in pubmed_metadata if a.get("year") is not None),
            key=lambda a: a["year"],
            default=None
        )

        if most_recent_article:
            result.update({
                "most_recent_pubmed_title": most_recent_article.get("title"),
                "most_recent_pubmed_year": most_recent_article.get("year"),
                "most_recent_pubmed_journal": most_recent_article.get("journal"),
                "most_recent_pubmed_field": (most_recent_article.get("mesh_terms") or ["Unknown"])[0]
            })
        else:
            result.update({
                "most_recent_pubmed_title": None,
                "most_recent_pubmed_year": None,
                "most_recent_pubmed_journal": None,
                "most_recent_pubmed_field": None
            })
    else:
        result.update({
            "pubmed_num_publications": 0,
            "most_recent_pubmed_title": None,
            "most_recent_pubmed_year": None,
            "most_recent_pubmed_journal": None,
            "most_recent_pubmed_field": None
        })

    # Save summarized data to file
    output_filename = f"verification_summary_{orcid_id.replace('-', '')}.json"
    with open(output_filename, "w") as f:
        json.dump(result, f, indent=2)

    print("\n=== Verification Summary ===")
    print(json.dumps(result, indent=2))
    print(f"\nSaved to {output_filename}")

# Main program execution
if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python orcid_lookup.py <orcid_id>")
        sys.exit(1)

    orcid_id = sys.argv[1]
    print(f"Verifying ORCID ID: {orcid_id}")

    # Fetch ORCID profile and name
    orcid_profile = get_orcid_profile(orcid_id)
    if not orcid_profile:
        print("Failed to retrieve ORCID profile.")
        sys.exit(1)

    name = extract_name_from_profile(orcid_profile)
    if not name:
        print("Could not extract name from ORCID profile.")
        sys.exit(1)

    # Fetch ORCID works and PubMed data
    orcid_works_data = fetch_orcid_works(orcid_id)
    pubmed_by_name = search_pubmed_by_name(name)
    pubmed_by_orcid = search_pubmed_by_orcid(orcid_id)

    # Merge PubMed results
    pmid_list = []
    if pubmed_by_orcid:
        pmid_list += pubmed_by_orcid.get("esearchresult", {}).get("idlist", [])
    if pubmed_by_name:
        pmid_list += pubmed_by_name.get("esearchresult", {}).get("idlist", [])

    pubmed_metadata = fetch_pubmed_metadata(pmid_list)

    # Summarize and save
    summarize_and_save(orcid_id, orcid_profile, pubmed_by_name, pubmed_by_orcid, orcid_works_data, pubmed_metadata)
