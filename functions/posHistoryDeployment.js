// Read-only preflight for the separately approved data operation.
export async function verifyHistoryDeployment({request,projectId}) {
  const root=`https://cloudfunctions.googleapis.com/v2/projects/${projectId}/locations/us-central1/functions/syncStoreOrderHistoryIndex`;
  const {data:fn}=await request({method:'GET',url:root});
  if(fn.state!=='ACTIVE' || fn.eventTrigger?.eventType!=='google.cloud.firestore.document.v1.written') throw new Error('History synchronization Function must be ACTIVE before backfill.');
  const {data}=await request({method:'GET',url:`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/collectionGroups/storeOrderHistoryIndex/indexes`});
  if(data.nextPageToken || (data.indexes||[]).length>100)throw new Error('Index metadata safety bound reached; review the deployment manually.');
  const shape=index=>JSON.stringify(index.fields.filter(field=>field.fieldPath!=='__name__').map(field=>[field.fieldPath,field.order||field.arrayConfig]));
  const fields=[['storeId','ASCENDING'],['workspaceId','ASCENDING']];
  for(const expected of [[...fields,['date','DESCENDING']],[...fields,['searchTerms','CONTAINS'],['date','DESCENDING']]]) {
    if(!(data.indexes||[]).some(index=>index.state==='READY' && index.queryScope==='COLLECTION' && shape(index)===JSON.stringify(expected))) throw new Error('Both history query indexes must be READY before backfill.');
  }
}
