import axios from 'axios';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { XMLParser } from 'fast-xml-parser';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

interface OrcidProfile {
  name: {
    'given-names': { value: string };
    'family-name': { value: string };
  };
}

interface OrcidWorks {
  'last-modified-date': {
    value: number;
  };
  group: Array<{
    'last-modified-date': {
      value: number;
    };
    'external-ids': {
      'external-id': Array<{
        'external-id-type': string;
        'external-id-value': string;
        'external-id-url': {
          value: string;
        };
        'external-id-relationship': string;
      }>;
    };
    'work-summary': Array<{
      'put-code': number;
      'created-date': {
        value: number;
      };
      'last-modified-date': {
        value: number;
      };
      source: {
        'source-orcid'?: {
          uri: string;
          path: string;
          host: string;
        };
        'source-client-id'?: any;
        'source-name': {
          value: string;
        };
      };
      title: {
        title: {
          value: string;
        };
      };
      'external-ids': {
        'external-id': Array<{
          'external-id-type': string;
          'external-id-value': string;
          'external-id-url': {
            value: string;
          };
          'external-id-relationship': string;
        }>;
      };
      url?: {
        value: string;
      };
      type: string;
      'publication-date': {
        year: { 
          value: string 
        };
        month?: { 
          value: string 
        };
        day?: { 
          value: string 
        };
      };
      'journal-title'?: {
        value: string;
      };
      visibility: string;
      path: string;
      'display-index': string;
    }>;
  }>;
  path: string;
}

type ActivitySection = 'employments' | 'educations';
type SummaryKey = 'employment-summary' | 'education-summary';

interface ActivitySummary {
  organization: { name: string };
}

interface ActivitySectionData {
  'employment-summary': ActivitySummary[];
  'education-summary': ActivitySummary[];
  'affiliation-group': Array<{
    summaries: Array<{
      [key: string]: { organization: { name: string } }
    }>
  }>;
}

interface OrcidActivities {
  employments: ActivitySectionData;
  educations: ActivitySectionData;
}

interface PubmedResponse {
  esearchresult: {
    idlist: string[];
    count: string;
  };
}

interface PubmedArticle {
  title: string;
  journal: string;
  year: number;
  publication_types: string[];
  mesh_terms: string[];
}

const sectionToSummary: Record<ActivitySection, SummaryKey> = {
  'employments': 'employment-summary',
  'educations': 'education-summary'
};

export async function getOrcidProfile(orcidId: string): Promise<OrcidProfile | null> {
  try {
    const response = await axios.get(`https://pub.orcid.org/v3.0/${orcidId}/person`, {
      headers: { 'Accept': 'application/json' }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching ORCID profile:', error);
    return null;
  }
}

export function extractNameFromProfile(profile: OrcidProfile): string | null {
  try {
    const given = profile.name['given-names'].value;
    const family = profile.name['family-name'].value;
    return `${given} ${family}`;
  } catch (error) {
    console.error('Error extracting name from profile:', error);
    return null;
  }
}

export async function extractVerifiedInstitution(orcidId: string): Promise<string[] | null> {
  try {
    const institutions: string[] = [];
    const response = await axios.get(`https://pub.orcid.org/v3.0/${orcidId}/activities`, {
      headers: { 'Accept': 'application/json' }
    });
    const data = response.data as OrcidActivities;

    const sections: ActivitySection[] = ['employments', 'educations'];
    for (const section of sections) {
      const summaryKey = sectionToSummary[section];
      const affiliationGroups = data[section]['affiliation-group'] || [];
      
      for (const group of affiliationGroups) {
        const summaries = group.summaries || [];
        for (const summary of summaries) {
          const item = summary[summaryKey];
          if (item?.organization?.name) {
            institutions.push(item.organization.name);
          }
        }
      }
    }

    return institutions.length > 0 ? [...new Set(institutions)] : null;
  } catch (error) {
    console.error('Error fetching institutions:', error);
    return null;
  }
}

export async function fetchOrcidWorks(orcidId: string) {
  try {
    const response = await axios.get(`https://pub.orcid.org/v3.0/${orcidId}/works`, {
      headers: { 'Accept': 'application/json' }
    });
    const data = response.data as OrcidWorks;
    const works = data.group;

    const publicationYears: number[] = [];
    const publicationTypes: string[] = [];
    const dois: string[] = [];
    const titles: string[] = [];
    const journals: string[] = [];

    for (const work of works) {
      const workSummary = work['work-summary']?.[0];
      if (!workSummary) continue;

      // Extract publication year
      const pubDate = workSummary['publication-date'];
      if (pubDate?.year?.value) {
        publicationYears.push(parseInt(pubDate.year.value));
      }

      // Extract publication type
      if (workSummary.type) {
        publicationTypes.push(workSummary.type);
      }

      // Extract title
      if (workSummary.title?.title?.value) {
        titles.push(workSummary.title.title.value);
      }

      // Extract journal title if available
      if (workSummary['journal-title']?.value) {
        journals.push(workSummary['journal-title'].value);
      }

      // Extract DOI if available
      const externalIds = work['external-ids']?.['external-id'] || [];
      for (const extId of externalIds) {
        if (extId['external-id-type'] === 'doi' && extId['external-id-value']) {
          dois.push(extId['external-id-value']);
          break; // Just take the first DOI per work
        }
      }
    }

    return {
      num_publications: works.length,
      publicationYears: [...new Set(publicationYears)],
      publicationTypes: [...new Set(publicationTypes)],
      dois: dois,
      publicationTitles: titles,
      publicationJournals: [...new Set(journals)]
    };
  } catch (error) {
    console.error('Error fetching ORCID works:', error);
    return null;
  }
}

export async function searchPubmedByOrcid(orcidId: string): Promise<PubmedResponse | null> {
  try {
    const response = await axios.get(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${orcidId}[aid]&retmode=json`
    );
    return response.data;
  } catch (error) {
    console.error('Error searching PubMed by ORCID:', error);
    return null;
  }
}

export async function fetchPubmedMetadata(pmidList: string[]): Promise<PubmedArticle[]> {
  if (!pmidList.length) return [];

  try {
    const ids = pmidList.join(',');
    const response = await axios.get(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids}&retmode=xml`
    );

    const parser = new XMLParser();
    const result = parser.parse(response.data);
    const articles: PubmedArticle[] = [];

    const pubmedArticles = result.PubmedArticleSet?.PubmedArticle || [];
    for (const article of pubmedArticles) {
      const title = article.MedlineCitation?.Article?.ArticleTitle;
      const journal = article.MedlineCitation?.Article?.Journal?.Title;
      const year = article.MedlineCitation?.Article?.Journal?.JournalIssue?.PubDate?.Year;
      const pubTypes = article.MedlineCitation?.Article?.PublicationTypeList?.PublicationType?.map(
        (pt: any) => pt['#text'] || ''
      ) || [];
      const meshTerms = article.MedlineCitation?.MeshHeadingList?.MeshHeading?.map(
        (mh: any) => mh.DescriptorName?.['#text'] || ''
      ) || [];

      articles.push({
        title: title || '',
        journal: journal || '',
        year: year ? parseInt(year) : 0,
        publication_types: pubTypes,
        mesh_terms: meshTerms
      });
    }

    return articles;
  } catch (error) {
    console.error('Error fetching PubMed metadata:', error);
    return [];
  }
}

export async function storeVerificationData(
  orcidId: string,
  blueskyHandle: string,
  blueskyDid: string,
  data: any
) {
  try {
    const item: any = {
      orcidId,
      ...data,
      timestamp: new Date().toISOString()
    };

    // Only add blueskyHandle and blueskyDid if they are not empty
    if (blueskyHandle) {
      item.blueskyHandle = blueskyHandle;
    }
    if (blueskyDid) {
      item.blueskyDid = blueskyDid;
    }

    const input = {
      TableName: process.env.VERIFICATION_TABLE,
      Item: item
    };

    await docClient.send(new PutCommand(input));
    console.log('Successfully stored verification data');
  } catch (error) {
    console.error('Error storing verification data:', error);
    throw error;
  }
} 