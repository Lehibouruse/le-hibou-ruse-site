export function completedVideoResultAllowed(result){
  return Boolean(result&&typeof result==="object"&&!Array.isArray(result)&&
    result.schema==="HIBOU_VIDEO_RENDER_RESULT_V2"&&
    result.prompt_contract_pass===true&&
    result.publication_authorized===false);
}
