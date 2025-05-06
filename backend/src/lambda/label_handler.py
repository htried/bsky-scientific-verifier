import json
import os
import time
import importlib
# import sys

# Global session for connection pooling
_client_module = None

publication_years_labels = [
    'publication-years-zero-four',
    'publication-years-five-nine',
    'publication-years-ten-nineteen',
    'publication-years-gte-twenty',
]

publication_count_labels = [
    'publications-one-nine',
    'publications-ten-fortynine',
    'publications-fifty-ninetynine',
    'publications-onehundred-twofifty',
    'publications-gte-twofifty',
]

def lazy_import():
    global _client_module
    
    print("Starting client creation process")
    start_time = time.time()
    
    try:
        # Try to import with detailed logging
        print("Attempting to import atproto module")
        import_start = time.time()
        
        # First try to import the base module
        print("Importing base atproto module...")
        _atproto_module = importlib.import_module('atproto')
        print(f"Base module imported in {time.time() - import_start:.2f} seconds")

        print("Importing reporef")
        _reporef_module = importlib.import_module('atproto_client.models.com.atproto.admin.defs')
        print(f"reporef module imported in {time.time() - import_start:.2f} seconds")
        
        # Then get the Client class
        print("Getting Client class...")
        Client = _atproto_module.Client
        print(f"Client class obtained in {time.time() - import_start:.2f} seconds")

        print("Getting models")
        models = _atproto_module.models
        print(f"models class obtained in {time.time() - import_start:.2f} seconds")

        print("Getting RepoRef")
        RepoRef = _reporef_module.RepoRef
        print(f"RepoRef class obtained in {time.time() - import_start:.2f} seconds")
        
        print("Creating client instance")
        client = Client()
        
        print(f"Client creation completed in {time.time() - start_time:.2f} seconds")
        return client, models, RepoRef
    except Exception as e:
        print(f"Error creating client: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise

def handler(event, context):
    try:
        start_time = time.time()
        print(f"Starting handler at {start_time}")
        
        # Parse the request body
        action = event.get('action')
        did = event.get('did')
        labels = event.get('labels', {})
        
        print(f"Parsed request: action={action}, did={did}")
        
        # Only initialize client if we have labels to apply
        client, models, RepoRef = None, None, None
        labeler_client = None
        
        if labels:
            # Initialize the client with retry logic
            print("Initializing client...")
            client, models, RepoRef = lazy_import()
            
            print("Logging in...")
            client.login(os.environ['BSKY_ID'], os.environ['BSKY_PWD'])
            
            print(f"Client initialized at {time.time() - start_time}s")
            
            # Create labeler client
            print("Creating labeler client...")
            labeler_client = client.with_proxy("atproto_labeler", os.environ['LABELER_DID'])
            
            print(f"Labeler client created at {time.time() - start_time}s")
        
        # Prepare labels
        label_vals = []

        if labels.get('numPublications'):
            label_vals.append(get_pub_count_label(labels['numPublications']))

        if labels.get('firstPubYear') and labels.get('lastPubYear'):
            label_vals.append(get_year_range_label(labels['firstPubYear'], labels['lastPubYear']))

        label_vals.append('verified-scientist')
        
        print(f"Labels prepared: {label_vals} at {time.time() - start_time}s")

        if action not in ['add', 'delete', 'update']:
            raise ValueError(f"Invalid action: {action}")
        
        emit_events = []

        if action == 'delete' or action == 'update':
            emit_events.append(models.ToolsOzoneModerationEmitEvent.Data(
                created_by=client.me.did,
                event=models.ToolsOzoneModerationDefs.ModEventLabel(
                    create_label_vals=[],
                    negate_label_vals=publication_years_labels + publication_count_labels + ['verified-scientist'],
                ),
                subject=RepoRef(did=did),
                subject_blob_cids=[],
            ))

        if action == 'add' or action == 'update':
            emit_events.append(models.ToolsOzoneModerationEmitEvent.Data(
                created_by=client.me.did,
                event=models.ToolsOzoneModerationDefs.ModEventLabel(
                    create_label_vals=label_vals,
                    negate_label_vals=[],
                ),
                subject=RepoRef(did=did),
                subject_blob_cids=[],
            ))
                
        print(f"Data prepared at {time.time() - start_time}s")
        
        # Apply the labels
        if label_vals and labeler_client:
            try:
                print("Sending label application request...")
                # print("Request data:", json.dumps(data, indent=2))  # Add debug logging
                for emit_event in emit_events:
                    result = labeler_client.tools.ozone.moderation.emit_event(emit_event)
                    print(f"Label application completed at {time.time() - start_time}s")
                    print("Label application result:", result)
            except Exception as e:
                print(f"Error applying labels at {time.time() - start_time}s:", str(e))
                print(f"Error type: {type(e)}")
                import traceback
                print(f"Traceback: {traceback.format_exc()}")
                # Continue execution even if label application fails
                result = None

        total_time = time.time() - start_time
        print(f"Total execution time: {total_time}s")

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': True
            },
            'body': json.dumps({
                'success': True,
                'message': f'Successfully {action}ed labels for {did}',
                'execution_time': total_time
            })
        }
        
    except Exception as e:
        print("Error in handler:", str(e))
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': True
            },
            'body': json.dumps({
                'error': str(e)
            })
        }
    

# Helper functions for label generation
def get_pub_count_label(count: int) -> str:
    if count >= 250: return publication_count_labels[4]
    if count >= 100: return publication_count_labels[3]
    if count >= 50: return publication_count_labels[2]
    if count >= 10: return publication_count_labels[1]
    return publication_count_labels[0]

def get_year_range_label(first_year: int, last_year: int) -> str:
    range = last_year - first_year
    if range >= 20: return publication_years_labels[3]
    if range >= 10: return publication_years_labels[2]
    if range >= 5: return publication_years_labels[1]
    return publication_years_labels[0]
