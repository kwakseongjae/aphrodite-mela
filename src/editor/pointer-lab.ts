import {makeBlock,uid,type Page} from '../model';
export function pointerLabPage():Page {
  const root=makeBlock('frame');root.title='Pointer workspace';root.layout={columns:2,padding:16,gap:16,height:440};
  const a=makeBlock('frame');a.title='Frame A';a.parentId=root.id;a.layout={mode:'free',height:390,padding:16};
  const b=makeBlock('frame');b.title='Frame B';b.parentId=root.id;b.layout={mode:'free',height:390,padding:16};
  const card=makeBlock('cards');card.title='온보딩 플로우';card.text='핵심 화면 정리|팀 리뷰를 준비합니다.';card.provider='mui';card.parentId=a.id;card.options={columns:1,state:'default'};card.layout={widthPx:220,height:220,x:12,y:48};
  return {id:uid(),name:'Pointer lab',blocks:[root,a,b,card]};
}
