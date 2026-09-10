import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Button as AstryxButton } from '@astryxdesign/core/Button';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { ActionButton } from '@seed-design/react';
import { Button as ShadcnButton } from './shadcn-button';
type Props={kind:string;provider:string;title:string;text:string;label:string;variant?:string;options?:{state?:string;density?:string;columns?:number};accent:string;onAccent?:string;foreground:string;background?:string;headingFont?:string;radius:number};
declare global { interface Window { aphroditeProps: Props } }
export function LibraryComponent({p}:{p:Props}) {
  const [clicked,setClicked]=useState(false);
  const state=p.options?.state, disabled=state==='disabled', loading=state==='loading';
  const onClick=()=>setClicked(true), label=p.label||'Continue';
  let component:React.ReactNode;
  if(p.provider==='mui') {
    const theme=createTheme({palette:{primary:{main:p.accent,...(p.onAccent?{contrastText:p.onAccent}:{})},background:{default:p.background??'#fff',paper:p.background??'#fff'},text:{primary:p.foreground,secondary:p.foreground}},typography:{fontFamily:'Arial, Helvetica, sans-serif'},shape:{borderRadius:p.radius}});
    component=<ThemeProvider theme={theme}>{p.kind==='input'?<TextField type={p.variant==='search'?'search':'text'} size={p.options?.density==='compact'?'small':'medium'} fullWidth label={p.title||label} placeholder={p.label} helperText={state==='error'?'입력 내용을 확인해주세요':p.text} error={state==='error'} disabled={disabled} variant={p.variant==='filled'?'filled':'outlined'}/>:p.kind==='cards'?<div className="vendor-cards" style={{display:'grid',gridTemplateColumns:p.variant==='list'?'1fr':`repeat(${p.options?.columns??3},minmax(0,1fr))`,gap:16}}>{(['empty','loading','error'].includes(state??'')?[]:p.text.split('\n').slice(0,50)).map((row,i)=><Card key={i} sx={{backgroundColor:p.background,color:p.foreground}} variant={p.variant==='outlined'?'outlined':undefined} elevation={p.variant==='elevated'?3:0}><CardContent><strong style={{fontFamily:p.headingFont,fontSize:18,fontWeight:400}}>{row.split('|')[0]}</strong><p>{row.split('|')[1]}</p></CardContent></Card>)}{state==='empty'?'아직 항목이 없습니다':state==='loading'?'불러오는 중…':state==='error'?'내용을 불러오지 못했습니다':null}</div>:<Button variant={p.variant==='outline'?'outlined':p.variant==='ghost'?'text':'contained'} disabled={disabled} loading={loading} onClick={onClick}>{label}</Button>}</ThemeProvider>;
  } else if(p.provider==='astryx') component=<Theme theme={neutralTheme} mode="light"><AstryxButton label={label} variant={p.variant==='ghost'?'ghost':p.variant==='outline'?'secondary':'primary'} isDisabled={disabled} isLoading={loading} size="lg" onClick={onClick}/></Theme>;
  else if(p.provider==='seed') component=<ActionButton variant={p.variant==='ghost'?'ghost':p.variant==='outline'?'brandOutline':'brandSolid'} disabled={disabled||loading} aria-busy={loading} onClick={onClick}>{loading?'불러오는 중…':label}</ActionButton>;
  else component=<ShadcnButton variant={p.variant==='ghost'?'ghost':p.variant==='outline'?'outline':'default'} disabled={disabled||loading} aria-busy={loading} size="lg" onClick={onClick}>{loading?'불러오는 중…':label}</ShadcnButton>;
  return <section style={{padding:'8px 0',color:p.foreground,fontFamily:'Arial,sans-serif'}}><style>{'@media(max-width:500px){.vendor-cards{grid-template-columns:1fr!important}}'}</style>{component}{clicked?<p role="status" style={{color:p.foreground,WebkitTextFillColor:p.foreground,fontSize:12,margin:'8px 0'}}>선택했습니다 · 프로토타입 동작</p>:null}</section>;
}
const root=document.getElementById('root')!;
const props=root.dataset.props?JSON.parse(root.dataset.props) as Props:window.aphroditeProps;
createRoot(root).render(<LibraryComponent p={props}/>);
