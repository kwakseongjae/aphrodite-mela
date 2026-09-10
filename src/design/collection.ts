import {safeImage,type Block} from '../model';
/** Positional slots follow the existing title|price rows; empty string explicitly means no image. */
export function collectionRows(block:Block){
 return block.text.split('\n').map((row,index)=>{
  const [title,text='']=row.split('|');
  return {index,title,text,image:safeImage(block.itemImages?.[index]??block.image)};
 });
}
