import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import Badge from '@mui/material/Badge';
import Avatar from '@mui/material/Avatar';
import AvatarGroup from '@mui/material/AvatarGroup';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Pagination from '@mui/material/Pagination';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Slider from '@mui/material/Slider';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Button as AstryxButton } from '@astryxdesign/core/Button';
import { TextInput as AstryxTextInput } from '@astryxdesign/core/TextInput';
import { TextArea as AstryxTextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Switch as AstryxSwitch } from '@astryxdesign/core/Switch';
import { Card as AstryxCard } from '@astryxdesign/core/Card';
import { TabList, Tab as AstryxTab } from '@astryxdesign/core/TabList';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Table as AstryxTable } from '@astryxdesign/core/Table';
import { Banner } from '@astryxdesign/core/Banner';
import { Badge as AstryxBadge } from '@astryxdesign/core/Badge';
import { Avatar as AstryxAvatar } from '@astryxdesign/core/Avatar';
import { AvatarGroup as AstryxAvatarGroup } from '@astryxdesign/core/AvatarGroup';
import { Breadcrumbs as AstryxBreadcrumbs, BreadcrumbItem } from '@astryxdesign/core/Breadcrumbs';
import { Pagination as AstryxPagination } from '@astryxdesign/core/Pagination';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Skeleton as AstryxSkeleton } from '@astryxdesign/core/Skeleton';
import { Collapsible, CollapsibleGroup } from '@astryxdesign/core/Collapsible';
import { Token } from '@astryxdesign/core/Token';
import { Slider as AstryxSlider } from '@astryxdesign/core/Slider';
import { Stepper as AstryxStepper, Step as AstryxStep } from '@astryxdesign/core/Stepper';
import { ToggleButton as AstryxToggle, ToggleButtonGroup as AstryxToggleGroup } from '@astryxdesign/core/ToggleButton';
import { Calendar as AstryxCalendar, type ISODateString } from '@astryxdesign/core/Calendar';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import {
  ActionButton, TextField as SeedTextField, Field, Select as SeedSelect, Checkbox as SeedCheckbox,
  Switch as SeedSwitch, Tabs as SeedTabs, ChipTabs, SegmentedControl as SeedSegmented, Callout,
  Badge as SeedBadge, Avatar as SeedAvatar, IdentityPlaceholder, Skeleton as SeedSkeleton,
  Accordion as SeedAccordion, Chip as SeedChip, Slider as SeedSlider, ProgressCircle, ToggleButton as SeedToggle,
} from '@seed-design/react';
import { Button as ShadcnButton } from './shadcn-button';
import { Input as ShadcnInput } from './shadcn/input';
import { Textarea as ShadcnTextarea } from './shadcn/textarea';
import { Card as ShadcnCard, CardHeader as ShadcnCardHeader, CardTitle as ShadcnCardTitle, CardDescription as ShadcnCardDescription, CardContent as ShadcnCardContent } from './shadcn/card';
import { Badge as ShadcnBadge } from './shadcn/badge';
import { Table as ShadcnTable, TableHeader as ShadcnTableHeader, TableBody as ShadcnTableBody, TableRow as ShadcnTableRow, TableHead as ShadcnTableHead, TableCell as ShadcnTableCell } from './shadcn/table';
import { Skeleton as ShadcnSkeleton } from './shadcn/skeleton';
import { Alert as ShadcnAlert, AlertTitle as ShadcnAlertTitle, AlertDescription as ShadcnAlertDescription } from './shadcn/alert';
import { Breadcrumb as ShadcnBreadcrumb, BreadcrumbList, BreadcrumbItem as ShadcnCrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis } from './shadcn/breadcrumb';
import { Pagination as ShadcnPaginationNav, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext } from './shadcn/pagination';
import { cn } from './shadcn/utils';
import { type CoverageProvider, type OfficialKind } from './coverage';
type Props={kind:string;provider:string;title:string;text:string;label:string;variant?:string;options?:{state?:string;density?:string;columns?:number};accent:string;onAccent?:string;foreground:string;background?:string;headingFont?:string;radius:number;onClick?:()=>void};
declare global { interface Window { aphroditeProps: Props } }

const st=(p:Props)=>p.options?.state;
const dis=(p:Props)=>st(p)==='disabled';
const load=(p:Props)=>st(p)==='loading';
const err=(p:Props)=>st(p)==='error';
const empty=(p:Props)=>st(p)==='empty';
const ind=(p:Props)=>st(p)==='indeterminate';
const sm=(p:Props)=>p.options?.density==='compact';
const lab=(p:Props)=>p.label||'Continue';
const lines=(p:Props)=>p.text.split('\n').slice(0,50);
const cell=(row:string,i:number)=>row.split('|')[i]??'';
const cols=(p:Props)=>p.options?.columns??3;
const statusText=(p:Props)=>empty(p)?'아직 항목이 없습니다':load(p)?'불러오는 중…':err(p)?'내용을 불러오지 못했습니다':null;
const picks=(row:string)=>row.split('|').map(s=>s.trim()).filter(Boolean);
const opts=(p:Props)=>{const from=lines(p).flatMap(picks);return from.length?from.slice(0,8):[lab(p),'Option B','Option C'];};
const pageCount=(p:Props)=>{const n=parseInt(p.text,10);return Number.isFinite(n)&&n>0?Math.min(20,Math.max(1,n)):Math.max(3,lines(p).filter(Boolean).length||5);};
const initials=(name:string)=>name.trim().slice(0,2)||'A';
const CheckIcon=()=><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2"/></svg>;
const MinusIcon=()=><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="2"/></svg>;

function MuiTabs({p}:{p:Props}){
  const items=lines(p);const [v,setV]=useState(0);
  const vertical=p.variant==='vertical';
  return <div><Tabs value={v} onChange={(_,n)=>setV(n)} orientation={vertical?'vertical':'horizontal'} variant={p.variant==='pills'||p.variant==='segmented'?'fullWidth':'standard'} textColor="primary" indicatorColor="primary">{items.map((row,i)=><Tab key={i} label={cell(row,0)||lab(p)} disabled={dis(p)} sx={p.variant==='pills'?{borderRadius:999,minHeight:36}:p.variant==='segmented'?{border:'1px solid',borderColor:'divider',minHeight:36}:{}}/>)}</Tabs>{items[v]?<p style={{margin:'8px 0'}}>{cell(items[v],1)}</p>:null}</div>;
}
function MuiTable({p}:{p:Props}){
  const msg=statusText(p);if(msg)return <>{msg}</>;
  const rows=lines(p).filter(Boolean);
  return <TableContainer component={Paper} variant={p.variant==='bordered'?'outlined':undefined} sx={{backgroundColor:p.background,color:p.foreground}}><Table size={sm(p)||p.variant==='compact'?'small':'medium'}><TableHead><TableRow><TableCell>항목</TableCell><TableCell>담당</TableCell><TableCell>상태</TableCell></TableRow></TableHead><TableBody>{rows.map((row,i)=><TableRow key={i} sx={p.variant==='striped'&&i%2?{backgroundColor:'action.hover'}:{}}><TableCell>{cell(row,0)}</TableCell><TableCell>{cell(row,1)}</TableCell><TableCell>{cell(row,2)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>;
}
function MuiSelect({p}:{p:Props}){
  const items=opts(p);const [v,setV]=useState(items[0]??'');
  const native=p.variant==='native';
  return <FormControl fullWidth size={sm(p)?'small':'medium'} disabled={dis(p)} error={err(p)} variant={p.variant==='filled'?'filled':'outlined'}><InputLabel id="aph-select">{p.title||lab(p)}</InputLabel><Select native={native} labelId="aph-select" label={p.title||lab(p)} value={v} onChange={e=>setV(typeof e.target.value==='string'?e.target.value:e.target.value as string)}>{native?items.map(o=><option key={o} value={o}>{o}</option>):items.map(o=><MenuItem key={o} value={o}>{o}</MenuItem>)}</Select><FormHelperText>{err(p)?'입력 내용을 확인해주세요':p.text}</FormHelperText></FormControl>;
}
function MuiAccordion({p}:{p:Props}){
  const items=lines(p).filter(Boolean);const multi=p.variant==='multiple';const [open,setOpen]=useState<string|false>(multi?false:'0');
  return <div>{items.map((row,i)=><Accordion key={i} disabled={dis(p)} expanded={multi?undefined:open===String(i)} onChange={multi?undefined:(_,exp)=>setOpen(exp?String(i):false)} variant={p.variant==='bordered'?'outlined':undefined} disableGutters={sm(p)}><AccordionSummary>{cell(row,0)||lab(p)}</AccordionSummary><AccordionDetails>{cell(row,1)||p.text}</AccordionDetails></Accordion>)}</div>;
}
function MuiSlider({p}:{p:Props}){
  const range=p.variant==='range';const [v,setV]=useState<number|number[]>(range?[20,80]:40);
  return <Slider value={v} onChange={(_,n)=>setV(n)} disabled={dis(p)} size={sm(p)?'small':'medium'} step={p.variant==='stepped'?10:1} marks={p.variant==='stepped'} valueLabelDisplay="auto"/>;
}
function MuiToggle({p}:{p:Props}){
  const items=lines(p).filter(Boolean).slice(0,4);const choices=items.length?items.map((row,i)=>({v:String(i),l:cell(row,0)||lab(p)})):[{v:'a',l:lab(p)},{v:'b',l:'Option'}];
  const [v,setV]=useState<string|string[]>(p.variant==='group'?[choices[0].v]:choices[0].v);
  return <ToggleButtonGroup exclusive={p.variant!=='group'} value={v} onChange={(_,n)=>{if(n!==null)setV(n);}} disabled={dis(p)} size={sm(p)?'small':'medium'}>{choices.map(c=><ToggleButton key={c.v} value={c.v} aria-label={c.l}>{p.variant==='icon'?c.l.slice(0,1):c.l}</ToggleButton>)}</ToggleButtonGroup>;
}
function MuiChips({p}:{p:Props}){
  const items=lines(p).filter(Boolean);const tags=items.length?items.map(row=>cell(row,0)||lab(p)):[lab(p),'Design','Review'];
  const [sel,setSel]=useState(tags[0]);
  return <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{tags.map(t=><Chip key={t} label={t} size={sm(p)?'small':'medium'} disabled={dis(p)} color={p.variant==='choice'&&sel===t?'primary':'default'} variant={p.variant==='choice'&&sel!==t?'outlined':'filled'} onClick={p.variant==='filter'||p.variant==='choice'?()=>setSel(t):undefined} onDelete={p.variant==='removable'?()=>{}:undefined}/>)}</div>;
}

function AxInput({p}:{p:Props}){const [v,setV]=useState('');return <AstryxTextInput label={p.title||lab(p)} value={v} onChange={setV} placeholder={p.label} isDisabled={dis(p)} isLoading={load(p)} status={err(p)?{type:'error',message:p.text||'입력 내용을 확인해주세요'}:undefined} size={sm(p)?'sm':'md'} width="100%"/>;}
function AxTextarea({p}:{p:Props}){const [v,setV]=useState(p.text);return <AstryxTextArea label={p.title||lab(p)} value={v} onChange={setV} placeholder={p.label} isDisabled={dis(p)} isLoading={load(p)} status={err(p)?{type:'error',message:'입력 내용을 확인해주세요'}:undefined} rows={3} width="100%"/>;}
function AxSelect({p}:{p:Props}){
  const items=opts(p);
  if(p.variant==='native')return <label style={{display:'grid',gap:6,fontSize:13}}>{p.title||lab(p)}<select disabled={dis(p)} defaultValue={items[0]} style={{height:sm(p)?32:36,borderRadius:p.radius}}>{items.map(o=><option key={o}>{o}</option>)}</select></label>;
  return <Selector label={p.title||lab(p)} options={items} value={items[0]} isDisabled={dis(p)} isLoading={load(p)} status={err(p)?{type:'error',message:p.text}:undefined} size={sm(p)?'sm':'md'} width="100%" placeholder={p.label}/>;
}
function AxTabs({p}:{p:Props}){
  const items=lines(p).filter(Boolean);const first=cell(items[0]??'',0)||'tab-0';const [v,setV]=useState(first);
  if(p.variant==='segmented')return <SegmentedControl value={v} onChange={setV} label={p.title||lab(p)} isDisabled={dis(p)} size={sm(p)?'sm':'md'} layout="fill">{items.map((row,i)=><SegmentedControlItem key={i} value={cell(row,0)||String(i)} label={cell(row,0)||lab(p)}/>)}</SegmentedControl>;
  return <div><TabList value={v} onChange={setV} size={sm(p)?'sm':'lg'} hasDivider={p.variant!=='pills'} layout={p.variant==='pills'?'fill':'hug'}>{items.map((row,i)=><AstryxTab key={i} value={cell(row,0)||String(i)} label={cell(row,0)||lab(p)}/>)}</TabList><p style={{margin:'8px 0'}}>{cell(items.find(r=>cell(r,0)===v)??items[0]??'',1)}</p></div>;
}
function AxTable({p}:{p:Props}){
  const msg=statusText(p);if(msg)return <>{msg}</>;
  const data=lines(p).filter(Boolean).map((row,i)=>({id:String(i),a:cell(row,0),b:cell(row,1),c:cell(row,2)}));
  return <AstryxTable data={data} idKey="id" columns={[{key:'a',header:'항목'},{key:'b',header:'담당'},{key:'c',header:'상태'}]} density={sm(p)||p.variant==='compact'?'compact':'balanced'} isStriped={p.variant==='striped'} dividers={p.variant==='bordered'?'grid':'rows'}/>;
}
function AxSlider({p}:{p:Props}){
  const range=p.variant==='range';const [v,setV]=useState<number|[number,number]>(range?[20,80]:40);
  return range
    ? <AstryxSlider label={p.title||lab(p)} value={v as [number,number]} onChange={setV as (n:[number,number])=>void} isDisabled={dis(p)} step={p.variant==='stepped'?10:1} width="100%" marks={p.variant==='stepped'?[{value:0,label:'0'},{value:50,label:'50'},{value:100,label:'100'}]:undefined}/>
    : <AstryxSlider label={p.title||lab(p)} value={v as number} onChange={setV as (n:number)=>void} isDisabled={dis(p)} step={p.variant==='stepped'?10:1} width="100%" marks={p.variant==='stepped'?[{value:0,label:'0'},{value:50,label:'50'},{value:100,label:'100'}]:undefined}/>;
}
function AxToggle({p}:{p:Props}){
  const items=lines(p).filter(Boolean).slice(0,4);const choices=items.length?items.map((row,i)=>({v:String(i),l:cell(row,0)||lab(p)})):[{v:'a',l:lab(p)},{v:'b',l:'Option'}];
  const [single,setSingle]=useState<string|null>(choices[0].v);const [pressed,setPressed]=useState(false);
  if(p.variant==='group')return <AstryxToggleGroup type="single" value={single} onChange={setSingle} label={p.title||lab(p)} isDisabled={dis(p)} size={sm(p)?'sm':'lg'}>{choices.map(c=><AstryxToggle key={c.v} value={c.v} label={c.l}/>)}</AstryxToggleGroup>;
  return <AstryxToggle label={lab(p)} isPressed={pressed} onPressedChange={setPressed} isDisabled={dis(p)} isLoading={load(p)} isIconOnly={p.variant==='icon'} icon={p.variant==='icon'?<span aria-hidden>•</span>:undefined} size="lg"/>;
}
function AxPagination({p}:{p:Props}){const [page,setPage]=useState(1);return <AstryxPagination page={page} onChange={setPage} totalPages={pageCount(p)} isDisabled={dis(p)} size={sm(p)||p.variant==='compact'?'sm':'md'} variant={p.variant==='simple'?'none':p.variant==='compact'?'compact':'pages'} label={p.title||lab(p)}/>;}
function AxCalendar({p}:{p:Props}){
  const msg=statusText(p);if(msg)return <>{msg}</>;
  const items=lines(p).filter(Boolean).map(row=>({day:cell(row,0),task:cell(row,1),status:cell(row,2)||'대기'}));
  if(p.variant==='agenda'){
    const data=items.map((it,i)=>({id:String(i),...it}));
    return <AstryxTable data={data} idKey="id" columns={[{key:'day',header:'요일'},{key:'task',header:'업무'},{key:'status',header:'상태'}]} density={sm(p)?'compact':'balanced'} dividers="rows"/>;
  }
  if(p.variant==='board'){
    const groups=[...new Set(items.map(it=>it.status))];
    return <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.max(1,Math.min(groups.length,5))},minmax(0,1fr))`,gap:8}}>{groups.map(g=><AstryxCard key={g} variant="muted" elevation="none" padding={2}><strong>{g}</strong>{items.filter(it=>it.status===g).map((it,i)=><p key={i} style={{margin:'6px 0 0',fontSize:12}}>{it.day} · {it.task}</p>)}</AstryxCard>)}</div>;
  }
  const now=new Date();
  const offset=now.getDay()===0?-6:1-now.getDay();
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset);
  const end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+4);
  const iso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` as ISODateString;
  return <div><AstryxCalendar mode="range" defaultValue={{start:iso(start),end:iso(end)}} weekStartsOn="mon" hasWeekNumbers hasVariableRowCount/><ul style={{listStyle:'none',margin:'8px 0 0',padding:0,fontSize:12}}>{items.map((it,i)=><li key={i} style={{display:'flex',gap:8,padding:'4px 0'}}><b>{it.day}</b><span>{it.task}</span><small style={{marginLeft:'auto'}}>{it.status}</small></li>)}</ul></div>;
}

function SeedInput({p}:{p:Props}){
  return <Field.Root invalid={err(p)} disabled={dis(p)}><Field.Header><Field.Label>{p.title||lab(p)}</Field.Label></Field.Header><SeedTextField.Root size={sm(p)?'medium':'large'} variant={p.variant==='underlined'?'underline':'outline'}><SeedTextField.Input placeholder={p.label} disabled={dis(p)}/></SeedTextField.Root>{err(p)?<Field.ErrorMessage>입력 내용을 확인해주세요</Field.ErrorMessage>:<Field.Description>{p.text}</Field.Description>}</Field.Root>;
}
function SeedTextarea({p}:{p:Props}){
  return <Field.Root invalid={err(p)} disabled={dis(p)}><Field.Header><Field.Label>{p.title||lab(p)}</Field.Label></Field.Header><SeedTextField.Root size={sm(p)?'medium':'large'} variant={p.variant==='plain'?'underline':'outline'}><SeedTextField.Textarea placeholder={p.label} disabled={dis(p)}/></SeedTextField.Root>{err(p)?<Field.ErrorMessage>입력 내용을 확인해주세요</Field.ErrorMessage>:<Field.Description>{p.text}</Field.Description>}</Field.Root>;
}
function SeedSelectDemo({p}:{p:Props}){
  const items=opts(p);
  if(p.variant==='native')return <label style={{display:'grid',gap:6,fontSize:13}}>{p.title||lab(p)}<select disabled={dis(p)} defaultValue={items[0]} style={{height:sm(p)?36:44,borderRadius:p.radius}}>{items.map(o=><option key={o}>{o}</option>)}</select></label>;
  return <SeedSelect.Root defaultValue={[items[0]]} disabled={dis(p)} invalid={err(p)} size={sm(p)?'medium':'large'}><SeedSelect.Trigger><SeedSelect.Value/><SeedSelect.Placeholder>{p.label||'선택'}</SeedSelect.Placeholder></SeedSelect.Trigger><SeedSelect.Positioner><SeedSelect.Content>{items.map(o=><SeedSelect.Item key={o} value={o} label={o}><SeedSelect.ItemBody><SeedSelect.ItemLabel>{o}</SeedSelect.ItemLabel></SeedSelect.ItemBody></SeedSelect.Item>)}</SeedSelect.Content></SeedSelect.Positioner></SeedSelect.Root>;
}
function SeedTabsDemo({p}:{p:Props}){
  const items=lines(p).filter(Boolean);const first=String(0);
  if(p.variant==='segmented')return <SeedSegmented.Root defaultValue={first} disabled={dis(p)}><SeedSegmented.Indicator/>{items.map((row,i)=><SeedSegmented.Item key={i} value={String(i)} disabled={dis(p)}>{cell(row,0)||lab(p)}<SeedSegmented.ItemHiddenInput/></SeedSegmented.Item>)}</SeedSegmented.Root>;
  if(p.variant==='pills')return <ChipTabs.Root defaultValue={first} size={sm(p)?'medium':'large'}><ChipTabs.List>{items.map((row,i)=><ChipTabs.Trigger key={i} value={String(i)} disabled={dis(p)}>{cell(row,0)||lab(p)}</ChipTabs.Trigger>)}</ChipTabs.List>{items.map((row,i)=><ChipTabs.Content key={i} value={String(i)}>{cell(row,1)}</ChipTabs.Content>)}</ChipTabs.Root>;
  return <SeedTabs.Root defaultValue={first} orientation={p.variant==='vertical'?'vertical':'horizontal'} size={sm(p)?'small':'medium'}><SeedTabs.List>{items.map((row,i)=><SeedTabs.Trigger key={i} value={String(i)} disabled={dis(p)}>{cell(row,0)||lab(p)}</SeedTabs.Trigger>)}<SeedTabs.Indicator/></SeedTabs.List>{items.map((row,i)=><SeedTabs.Content key={i} value={String(i)}>{cell(row,1)}</SeedTabs.Content>)}</SeedTabs.Root>;
}
function SeedSliderDemo({p}:{p:Props}){
  const range=p.variant==='range';
  return <SeedSlider.Root defaultValues={range?[20,80]:[40]} min={0} max={100} step={p.variant==='stepped'?10:1} disabled={dis(p)}><SeedSlider.Control><SeedSlider.Track><SeedSlider.Range/></SeedSlider.Track><SeedSlider.Thumb thumbIndex={0}/><SeedSlider.HiddenInput thumbIndex={0}/>{range?<><SeedSlider.Thumb thumbIndex={1}/><SeedSlider.HiddenInput thumbIndex={1}/></>:null}</SeedSlider.Control></SeedSlider.Root>;
}

const noticeBar:Record<string,string>={info:'var(--brand)',success:'#16a34a',warning:'#d97706',error:'#dc2626'};
function crumbItems(p:Props){
  const raw=p.text.trim();
  if(raw.includes('|')&&!raw.includes('\n'))return raw.split('|').map(s=>s.trim()).filter(Boolean);
  const rows=lines(p).filter(Boolean);
  return rows.length?rows.map(row=>cell(row,0)):['Home','Library',lab(p)];
}
function pageLabels(p:Props){
  const raw=p.text.trim();
  if(raw.includes('|'))return raw.split('|').map(s=>s.trim()).filter(Boolean).slice(0,20);
  const n=parseInt(raw,10);
  if(Number.isFinite(n)&&n>0)return Array.from({length:Math.min(20,n)},(_,i)=>String(i+1));
  return ['1','2','3','4','5'];
}
function ShadcnTableDemo({p}:{p:Props}){
  const msg=statusText(p);if(msg)return <>{msg}</>;
  const rows=lines(p).filter(Boolean);
  const compact=sm(p)||p.variant==='compact';
  return <ShadcnTable className={p.variant==='bordered'?'border':undefined}><ShadcnTableHeader><ShadcnTableRow><ShadcnTableHead>항목</ShadcnTableHead><ShadcnTableHead>담당</ShadcnTableHead><ShadcnTableHead>상태</ShadcnTableHead></ShadcnTableRow></ShadcnTableHeader><ShadcnTableBody>{rows.map((row,i)=><ShadcnTableRow key={i} className={p.variant==='striped'&&i%2?'bg-muted/50':undefined}><ShadcnTableCell className={compact?'py-1':undefined}>{cell(row,0)}</ShadcnTableCell><ShadcnTableCell className={compact?'py-1':undefined}>{cell(row,1)}</ShadcnTableCell><ShadcnTableCell className={compact?'py-1':undefined}>{cell(row,2)}</ShadcnTableCell></ShadcnTableRow>)}</ShadcnTableBody></ShadcnTable>;
}
function ShadcnPaginationDemo({p}:{p:Props}){
  const items=pageLabels(p);const n=Math.max(1,items.length);const [page,setPage]=useState(1);
  const cur=Math.min(page,n);const compact=sm(p)||p.variant==='compact';const simple=p.variant==='simple';
  return <ShadcnPaginationNav aria-busy={load(p)||undefined} className={dis(p)?'pointer-events-none opacity-50':undefined}><PaginationContent><PaginationItem><PaginationPrevious href="#" className={compact?'h-8 px-2 text-xs':undefined} onClick={e=>{e.preventDefault();setPage(c=>Math.max(1,c-1));}}/></PaginationItem>{simple?null:items.map((label,i)=><PaginationItem key={i}><PaginationLink href="#" isActive={cur===i+1} size="icon" className={compact?'h-8 w-8 text-xs':undefined} onClick={e=>{e.preventDefault();setPage(i+1);}}>{label}</PaginationLink></PaginationItem>)}<PaginationItem><PaginationNext href="#" className={compact?'h-8 px-2 text-xs':undefined} onClick={e=>{e.preventDefault();setPage(c=>Math.min(n,c+1));}}/></PaginationItem></PaginationContent></ShadcnPaginationNav>;
}
function ShadcnBreadcrumbDemo({p}:{p:Props}){
  const items=crumbItems(p);const last=items.length-1;
  const visible=st(p)==='truncated'&&items.length>2?[items[0],null,items[last]]:[...items];
  const sep=p.variant==='slash'?'/':undefined;
  const pill=p.variant==='pills'?'rounded-full bg-muted px-2.5 py-0.5 text-xs':'';
  return <ShadcnBreadcrumb className={dis(p)?'pointer-events-none opacity-50':undefined}><BreadcrumbList className={sm(p)?'text-xs':undefined}>{visible.map((item,i,arr)=>{
    const isLast=i===arr.length-1;
    if(item===null)return <ShadcnCrumbItem key="ellipsis"><BreadcrumbEllipsis /><BreadcrumbSeparator>{sep}</BreadcrumbSeparator></ShadcnCrumbItem>;
    return <ShadcnCrumbItem key={`${item}-${i}`}>{isLast?<BreadcrumbPage className={pill}>{item}</BreadcrumbPage>:<><BreadcrumbLink href="#" className={pill}>{item}</BreadcrumbLink><BreadcrumbSeparator>{sep}</BreadcrumbSeparator></>}</ShadcnCrumbItem>;
  })}</BreadcrumbList></ShadcnBreadcrumb>;
}

const renderers: Record<CoverageProvider, Partial<Record<OfficialKind,(p:Props)=>ReactNode>>> = {
  mui: {
    button: p=>{const state=p.options?.state,disabled=state==='disabled',loading=state==='loading',onClick=p.onClick,label=p.label||'Continue';return <Button variant={p.variant==='outline'?'outlined':p.variant==='ghost'?'text':'contained'} disabled={disabled} loading={loading} onClick={onClick}>{label}</Button>;},
    input: p=>{const state=p.options?.state,disabled=state==='disabled',label=p.label||'Continue';return <TextField type={p.variant==='search'?'search':'text'} size={p.options?.density==='compact'?'small':'medium'} fullWidth label={p.title||label} placeholder={p.label} helperText={state==='error'?'입력 내용을 확인해주세요':p.text} error={state==='error'} disabled={disabled} variant={p.variant==='filled'?'filled':'outlined'}/>;},
    cards: p=>{const state=p.options?.state;return <div className="vendor-cards" style={{display:'grid',gridTemplateColumns:p.variant==='list'?'1fr':`repeat(${p.options?.columns??3},minmax(0,1fr))`,gap:16}}>{(['empty','loading','error'].includes(state??'')?[]:p.text.split('\n').slice(0,50)).map((row,i)=><Card key={i} sx={{backgroundColor:p.background,color:p.foreground}} variant={p.variant==='outlined'?'outlined':undefined} elevation={p.variant==='elevated'?3:0}><CardContent><strong style={{fontFamily:p.headingFont,fontSize:18,fontWeight:400}}>{row.split('|')[0]}</strong><p>{row.split('|')[1]}</p></CardContent></Card>)}{state==='empty'?'아직 항목이 없습니다':state==='loading'?'불러오는 중…':state==='error'?'내용을 불러오지 못했습니다':null}</div>;},
    tabs: p=><MuiTabs p={p}/>,
    table: p=><MuiTable p={p}/>,
    notice: p=><Alert severity={p.variant==='success'?'success':p.variant==='warning'?'warning':p.variant==='error'?'error':'info'} variant="outlined"><AlertTitle>{p.title||lab(p)}</AlertTitle>{load(p)?'불러오는 중…':empty(p)?'아직 항목이 없습니다':p.text}</Alert>,
    stats: p=>{const msg=statusText(p);if(msg)return <>{msg}</>;return <div style={{display:'grid',gridTemplateColumns:`repeat(${cols(p)},minmax(0,1fr))`,gap:16}}>{lines(p).filter(Boolean).map((row,i)=><Card key={i} variant={p.variant==='outlined'?'outlined':undefined} sx={{backgroundColor:p.variant==='tinted'?undefined:p.background,color:p.foreground,p:sm(p)?1:2}}><CardContent><p style={{margin:0,opacity:.7,fontSize:12}}>{cell(row,0)}</p><strong style={{fontFamily:p.headingFont,fontSize:p.variant==='compact'||sm(p)?20:28,fontWeight:400}}>{cell(row,1)}</strong><p style={{margin:'4px 0 0',fontSize:12}}>{cell(row,2)}</p></CardContent></Card>)}</div>;},
    select: p=><MuiSelect p={p}/>,
    checkbox: p=><FormControlLabel disabled={dis(p)} control={<Checkbox defaultChecked={!ind(p)} indeterminate={ind(p)||p.variant==='indeterminate'} size={sm(p)?'small':'medium'}/>} label={lab(p)} sx={p.variant==='card'?{border:'1px solid',borderColor:'divider',borderRadius:1,px:1.5,py:0.5,m:0}:{}}/>,
    switch: p=><FormControlLabel disabled={dis(p)} control={<Switch defaultChecked size={p.variant==='small'||sm(p)?'small':'medium'}/>} label={p.variant==='labelled'?lab(p):p.variant==='small'?'':lab(p)}/>,
    textarea: p=><TextField multiline minRows={3} fullWidth size={sm(p)?'small':'medium'} label={p.title||lab(p)} placeholder={p.label} helperText={err(p)?'입력 내용을 확인해주세요':p.text} error={err(p)} disabled={dis(p)} variant={p.variant==='filled'?'filled':p.variant==='plain'?'standard':'outlined'}/>,
    badge: p=>p.variant==='label'?<Chip size="small" color="primary" label={lab(p)}/>:<Badge color="primary" variant={p.variant==='dot'?'dot':'standard'} badgeContent={p.variant==='dot'?undefined:(parseInt(p.text,10)||3)}><Avatar sx={{bgcolor:p.accent,color:p.onAccent,width:sm(p)?28:36,height:sm(p)?28:36}}>{initials(lab(p))}</Avatar></Badge>,
    avatar: p=>p.variant==='group'?<AvatarGroup max={4}>{opts(p).map(n=><Avatar key={n} sx={{bgcolor:p.accent,color:p.onAccent}}>{initials(n)}</Avatar>)}</AvatarGroup>:<Avatar variant={p.variant==='rounded'?'rounded':'circular'} sx={{bgcolor:p.accent,color:p.onAccent,width:sm(p)?32:48,height:sm(p)?32:48,borderRadius:p.variant==='rounded'?p.radius:undefined}}>{initials(lab(p)||p.title)}</Avatar>,
    breadcrumb: p=><Breadcrumbs separator={p.variant==='chevron'?'›':'/'} maxItems={p.variant==='compact'?2:8} sx={{fontSize:sm(p)||p.variant==='compact'?12:14}}>{(lines(p).filter(Boolean).length?lines(p).filter(Boolean):['Home','Library',lab(p)]).map((row,i,arr)=>i===arr.length-1?<span key={i}>{cell(row,0)}</span>:<Link key={i} underline="hover" color="inherit" href="#">{cell(row,0)}</Link>)}</Breadcrumbs>,
    pagination: p=><Pagination count={pageCount(p)} disabled={dis(p)} size={sm(p)||p.variant==='compact'?'small':'medium'} variant={p.variant==='simple'?'text':'outlined'} shape={p.variant==='compact'?'rounded':'circular'} siblingCount={p.variant==='simple'?0:1} color="primary"/>,
    progress: p=>p.variant==='circle'?<CircularProgress variant={load(p)||ind(p)?'indeterminate':'determinate'} value={65} size={sm(p)?28:40} color="primary"/>:p.variant==='steps'?<Stepper activeStep={1} alternativeLabel={!sm(p)}>{['One','Two','Three'].map(s=><Step key={s}><StepLabel>{s}</StepLabel></Step>)}</Stepper>:<LinearProgress variant={load(p)||ind(p)?'indeterminate':'determinate'} value={65} color="primary"/>,
    skeleton: p=>p.variant==='card'?<Skeleton variant="rounded" height={120} sx={{borderRadius:p.radius}}/>:p.variant==='list'?<div>{[1,2,3].map(i=><Skeleton key={i} height={28} sx={{my:1}}/>)}</div>:<div><Skeleton variant="text" width="80%"/><Skeleton variant="text" width="60%"/></div>,
    accordion: p=><MuiAccordion p={p}/>,
    chips: p=><MuiChips p={p}/>,
    slider: p=><MuiSlider p={p}/>,
    stepper: p=><Stepper activeStep={1} orientation={p.variant==='vertical'?'vertical':'horizontal'} alternativeLabel={p.variant!=='vertical'&&p.variant!=='compact'} sx={p.variant==='compact'||sm(p)?{'.MuiStepLabel-label':{fontSize:12}}:{}}>{(lines(p).filter(Boolean).length?lines(p).filter(Boolean):['Start','Review','Done']).map((row,i)=><Step key={i}><StepLabel>{cell(row,0)}</StepLabel></Step>)}</Stepper>,
    toggle: p=><MuiToggle p={p}/>,
  },
  astryx: {
    button: p=>{const state=p.options?.state,disabled=state==='disabled',loading=state==='loading',onClick=p.onClick,label=p.label||'Continue';return <AstryxButton label={label} variant={p.variant==='ghost'?'ghost':p.variant==='outline'?'secondary':'primary'} isDisabled={disabled} isLoading={loading} size="lg" onClick={onClick}/>;},
    input: p=><AxInput p={p}/>,
    textarea: p=><AxTextarea p={p}/>,
    select: p=><AxSelect p={p}/>,
    checkbox: p=><div style={p.variant==='card'?{border:'1px solid var(--color-border, #ddd)',borderRadius:p.radius,padding:8}:{}}><CheckboxInput label={lab(p)} value={ind(p)||p.variant==='indeterminate'?'indeterminate':true} isDisabled={dis(p)} isLoading={load(p)} size={sm(p)?'sm':'md'} description={p.text||undefined}/></div>,
    switch: p=><AstryxSwitch label={lab(p)} value={true} isDisabled={dis(p)} isLoading={load(p)} size={p.variant==='small'||sm(p)?'sm':'md'} isLabelHidden={p.variant!=='labelled'&&p.variant!=='default'?p.variant==='small':false}/>,
    cards: p=>{const msg=statusText(p);const rows=(['empty','loading','error'].includes(st(p)??'')?[]:p.text.split('\n').slice(0,50));return <div className="vendor-cards" style={{display:'grid',gridTemplateColumns:p.variant==='list'?'1fr':`repeat(${p.options?.columns??3},minmax(0,1fr))`,gap:16}}>{rows.map((row,i)=><AstryxCard key={i} variant={p.variant==='outlined'?'default':'muted'} elevation={p.variant==='elevated'?'low':'none'} padding={sm(p)?2:4}><strong style={{fontFamily:p.headingFont,fontSize:18,fontWeight:400}}>{row.split('|')[0]}</strong><p>{row.split('|')[1]}</p></AstryxCard>)}{msg}</div>;},
    tabs: p=><AxTabs p={p}/>,
    table: p=><AxTable p={p}/>,
    notice: p=><Banner status={p.variant==='success'?'success':p.variant==='warning'?'warning':p.variant==='error'?'error':'info'} title={p.title||lab(p)} description={load(p)?'불러오는 중…':empty(p)?'아직 항목이 없습니다':p.text} collapsible={false} container="section"/>,
    stats: p=>{const msg=statusText(p);if(msg)return <>{msg}</>;return <div style={{display:'grid',gridTemplateColumns:`repeat(${cols(p)},minmax(0,1fr))`,gap:16}}>{lines(p).filter(Boolean).map((row,i)=><AstryxCard key={i} variant={p.variant==='tinted'?'muted':'default'} elevation="none" padding={sm(p)||p.variant==='compact'?2:4}><p style={{margin:0,fontSize:12}}>{cell(row,0)}</p><strong style={{fontFamily:p.headingFont,fontSize:24,fontWeight:400}}>{cell(row,1)}</strong><p style={{margin:'4px 0 0',fontSize:12}}>{cell(row,2)}</p></AstryxCard>)}</div>;},
    badge: p=><AstryxBadge label={p.variant==='count'?String(parseInt(p.text,10)||3):p.variant==='dot'?'':lab(p)} variant="info"/>,
    avatar: p=>p.variant==='group'?<AstryxAvatarGroup size={sm(p)?'sm':'md'}>{opts(p).slice(0,4).map(n=><AstryxAvatar key={n} name={n} size="md" shape="circle"/>)}</AstryxAvatarGroup>:<AstryxAvatar name={lab(p)||p.title} size={sm(p)?'sm':'lg'} shape={p.variant==='rounded'?'rounded':'circle'}/>,
    breadcrumb: p=><AstryxBreadcrumbs separator={p.variant==='chevron'?'›':'/'} variant={p.variant==='compact'?'supporting':'default'}>{(lines(p).filter(Boolean).length?lines(p).filter(Boolean):['Home','Library',lab(p)]).map((row,i,arr)=><BreadcrumbItem key={i} isCurrent={i===arr.length-1}>{cell(row,0)}</BreadcrumbItem>)}</AstryxBreadcrumbs>,
    pagination: p=><AxPagination p={p}/>,
    progress: p=><ProgressBar label={p.title||lab(p)} value={65} isIndeterminate={load(p)||ind(p)} hasValueLabel={!load(p)} variant="accent"/>,
    skeleton: p=>p.variant==='card'?<AstryxSkeleton height={120} width="100%" radius={2}/>:p.variant==='list'?<div style={{display:'grid',gap:8}}>{[1,2,3].map(i=><AstryxSkeleton key={i} height={20} width="100%"/>)}</div>:<div style={{display:'grid',gap:6}}><AstryxSkeleton height={12} width="80%"/><AstryxSkeleton height={12} width="60%"/></div>,
    accordion: p=><CollapsibleGroup type={p.variant==='multiple'?'multiple':'single'} defaultValue={p.variant==='multiple'?['0']:'0'} hasDividers={p.variant==='bordered'}>{lines(p).filter(Boolean).map((row,i)=><Collapsible key={i} value={String(i)} trigger={cell(row,0)||lab(p)} isDisabled={dis(p)} defaultIsOpen={i===0}>{cell(row,1)||p.text}</Collapsible>)}</CollapsibleGroup>,
    chips: p=><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{(lines(p).filter(Boolean).length?lines(p).filter(Boolean).map(r=>cell(r,0)):[lab(p),'Design','Review']).map(t=><Token key={t} label={t} isDisabled={dis(p)} size={sm(p)?'sm':'md'} onRemove={p.variant==='removable'?()=>{}:undefined} onClick={p.variant==='filter'||p.variant==='choice'?()=>{}:undefined}/>)}</div>,
    slider: p=><AxSlider p={p}/>,
    stepper: p=><AstryxStepper activeStep={1} orientation={p.variant==='vertical'?'vertical':'horizontal'} density={p.variant==='compact'||sm(p)?'compact':'balanced'} label={p.title||lab(p)}>{(lines(p).filter(Boolean).length?lines(p).filter(Boolean):['Start','Review','Done']).map((row,i)=><AstryxStep key={i} step={i} label={cell(row,0)} description={cell(row,1)}/>)}</AstryxStepper>,
    toggle: p=><AxToggle p={p}/>,
    calendar: p=><AxCalendar p={p}/>,
  },
  seed: {
    button: p=>{const state=p.options?.state,disabled=state==='disabled',loading=state==='loading',onClick=p.onClick,label=p.label||'Continue';return <ActionButton variant={p.variant==='ghost'?'ghost':p.variant==='outline'?'brandOutline':'brandSolid'} disabled={disabled||loading} aria-busy={loading} onClick={onClick}>{loading?'불러오는 중…':label}</ActionButton>;},
    input: p=><SeedInput p={p}/>,
    textarea: p=><SeedTextarea p={p}/>,
    select: p=><SeedSelectDemo p={p}/>,
    checkbox: p=><div style={p.variant==='card'?{border:'1px solid var(--seed-color-stroke-neutral-muted, #ddd)',borderRadius:p.radius,padding:8}:{}}><SeedCheckbox.Root defaultChecked={!ind(p)&&p.variant!=='indeterminate'} indeterminate={ind(p)||p.variant==='indeterminate'} disabled={dis(p)} size={sm(p)?'medium':'large'}><SeedCheckbox.Control><SeedCheckbox.Indicator checked={<CheckIcon/>} indeterminate={<MinusIcon/>}/></SeedCheckbox.Control><SeedCheckbox.Label>{lab(p)}</SeedCheckbox.Label><SeedCheckbox.HiddenInput/></SeedCheckbox.Root></div>,
    switch: p=><SeedSwitch.Root defaultChecked disabled={dis(p)} size={p.variant==='small'||sm(p)?'16':'32'}><SeedSwitch.Control><SeedSwitch.Thumb/></SeedSwitch.Control>{p.variant!=='small'?<SeedSwitch.Label>{lab(p)}</SeedSwitch.Label>:null}<SeedSwitch.HiddenInput/></SeedSwitch.Root>,
    tabs: p=><SeedTabsDemo p={p}/>,
    notice: p=><Callout.Root tone={p.variant==='success'?'positive':p.variant==='warning'?'warning':p.variant==='error'?'critical':'informative'}><Callout.Content><Callout.Title>{p.title||lab(p)}</Callout.Title><Callout.Description>{load(p)?'불러오는 중…':empty(p)?'아직 항목이 없습니다':p.text}</Callout.Description></Callout.Content></Callout.Root>,
    badge: p=><SeedBadge size={sm(p)?'medium':'large'} variant={p.variant==='dot'?'solid':'solid'} tone="brand">{p.variant==='count'?String(parseInt(p.text,10)||3):p.variant==='dot'?'·':lab(p)}</SeedBadge>,
    avatar: p=>p.variant==='group'?<SeedAvatar.Stack size={sm(p)?'36':'48'}>{opts(p).slice(0,4).map(n=><SeedAvatar.Root key={n}><SeedAvatar.Fallback>{initials(n)}</SeedAvatar.Fallback></SeedAvatar.Root>)}</SeedAvatar.Stack>:<SeedAvatar.Root size={sm(p)?'36':'48'}><SeedAvatar.Fallback>{p.variant==='rounded'?<span style={{borderRadius:p.radius}}>{initials(lab(p)||p.title)}</span>:<IdentityPlaceholder.Root><IdentityPlaceholder.Image/></IdentityPlaceholder.Root>}</SeedAvatar.Fallback></SeedAvatar.Root>,
    skeleton: p=>p.variant==='card'?<SeedSkeleton height="120px" width="100%"/>:p.variant==='list'?<div style={{display:'grid',gap:8}}>{[1,2,3].map(i=><SeedSkeleton key={i} height="20px" width="100%"/>)}</div>:<div style={{display:'grid',gap:6}}><SeedSkeleton height="12px" width="80%"/><SeedSkeleton height="12px" width="60%"/></div>,
    accordion: p=><SeedAccordion.Root defaultValues={['0']} multiple={p.variant==='multiple'} variant={p.variant==='bordered'?'separated':'inline'} disabled={dis(p)}>{lines(p).filter(Boolean).map((row,i)=><SeedAccordion.Item key={i} value={String(i)}><SeedAccordion.Header><SeedAccordion.Trigger><SeedAccordion.Title>{cell(row,0)||lab(p)}</SeedAccordion.Title></SeedAccordion.Trigger></SeedAccordion.Header><SeedAccordion.Content><SeedAccordion.Body>{cell(row,1)||p.text}</SeedAccordion.Body></SeedAccordion.Content></SeedAccordion.Item>)}</SeedAccordion.Root>,
    chips: p=><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{(lines(p).filter(Boolean).length?lines(p).filter(Boolean).map(r=>cell(r,0)):[lab(p),'Design','Review']).map(t=><SeedChip.Root key={t} variant={p.variant==='choice'?'outlineStrong':'solid'} size={sm(p)?'small':'medium'} disabled={dis(p)}><SeedChip.Label>{t}</SeedChip.Label>{p.variant==='removable'?<SeedChip.SuffixIcon>×</SeedChip.SuffixIcon>:null}</SeedChip.Root>)}</div>,
    slider: p=><SeedSliderDemo p={p}/>,
    progress: p=><ProgressCircle.Root value={load(p)||ind(p)?undefined:65} tone="brand" size={sm(p)?'24':'40'}><ProgressCircle.Track/><ProgressCircle.Range/></ProgressCircle.Root>,
    toggle: p=><SeedToggle defaultPressed={false} disabled={dis(p)} loading={load(p)} variant={p.variant==='icon'?'neutralWeak':'brandSolid'} size={sm(p)?'xsmall':'small'}>{p.variant==='icon'?lab(p).slice(0,1):lab(p)}</SeedToggle>,
  },
  shadcn: {
    button: p=>{const state=p.options?.state,disabled=state==='disabled',loading=state==='loading',onClick=p.onClick,label=p.label||'Continue';return <ShadcnButton variant={p.variant==='ghost'?'ghost':p.variant==='outline'?'outline':'default'} disabled={disabled||loading} aria-busy={loading} size="lg" onClick={onClick}>{loading?'불러오는 중…':label}</ShadcnButton>;},
    input: p=><label className="grid w-full gap-1.5 text-sm"><span className="text-foreground">{p.title||lab(p)}</span><ShadcnInput type={p.variant==='search'?'search':'text'} placeholder={p.label} disabled={dis(p)} aria-invalid={err(p)||undefined} className={cn(sm(p)&&'h-8 text-xs',p.variant==='filled'&&'bg-muted border-transparent',p.variant==='underlined'&&'rounded-none border-0 border-b shadow-none',err(p)&&'border-destructive')}/><span className={cn('text-xs',err(p)?'text-destructive':'text-muted-foreground')}>{err(p)?'입력 내용을 확인해주세요':p.text}</span></label>,
    textarea: p=><label className="grid w-full gap-1.5 text-sm"><span className="text-foreground">{p.title||lab(p)}</span><ShadcnTextarea placeholder={p.label} disabled={dis(p)} aria-invalid={err(p)||undefined} className={cn(sm(p)&&'min-h-[48px] py-1 text-xs',p.variant==='filled'&&'bg-muted border-transparent',p.variant==='minimal'&&'border-0 shadow-none bg-transparent px-0',err(p)&&'border-destructive')}/><span className={cn('text-xs',err(p)?'text-destructive':'text-muted-foreground')}>{err(p)?'입력 내용을 확인해주세요':p.text}</span></label>,
    cards: p=>{const msg=statusText(p);const rows=(['empty','loading','error'].includes(st(p)??'')?[]:p.text.split('\n').slice(0,50));return <div className="vendor-cards" style={{display:'grid',gridTemplateColumns:p.variant==='list'?'1fr':`repeat(${p.options?.columns??3},minmax(0,1fr))`,gap:sm(p)?8:16}}>{rows.map((row,i)=><ShadcnCard key={i} className={cn(p.variant==='outlined'&&'shadow-none',p.variant==='elevated'&&'shadow-lg')}>{p.variant==='media'?<div className="h-20 bg-muted" aria-hidden="true"/>:null}<ShadcnCardHeader className={sm(p)?'p-3':undefined}><ShadcnCardTitle style={{fontFamily:p.headingFont,fontWeight:400}}>{row.split('|')[0]}</ShadcnCardTitle><ShadcnCardDescription>{row.split('|')[1]}</ShadcnCardDescription></ShadcnCardHeader>{p.variant==='media'?<ShadcnCardContent className={sm(p)?'p-3 pt-0':undefined}/>:null}</ShadcnCard>)}{msg}</div>;},
    badge: p=>{if(empty(p))return <span className="text-sm text-muted-foreground">아직 항목이 없습니다</span>;const items=lines(p).filter(Boolean);const tags=items.length?items.map(row=>({label:cell(row,0)||lab(p),tone:cell(row,1)})):[{label:lab(p),tone:''}];return <div className="flex flex-wrap gap-2">{tags.map((t,i)=><ShadcnBadge key={i} variant={t.tone==='error'&&p.variant!=='outline'?'destructive':p.variant==='outline'?'outline':p.variant==='soft'?'secondary':'default'} className={cn(dis(p)&&'opacity-50',sm(p)&&'px-1.5')} style={t.tone==='success'?{background:'#16a34a',color:'#fff',borderColor:'transparent'}:t.tone==='warning'?{background:'#d97706',color:'#fff',borderColor:'transparent'}:undefined}>{t.label}</ShadcnBadge>)}</div>;},
    table: p=><ShadcnTableDemo p={p}/>,
    skeleton: p=>{if(empty(p))return <span className="text-sm text-muted-foreground">아직 항목이 없습니다</span>;if(p.variant==='card')return <ShadcnCard><div className="h-20 bg-muted rounded-t-xl"/><ShadcnCardHeader className="space-y-2"><ShadcnSkeleton className="h-4 w-3/4"/><ShadcnSkeleton className="h-3 w-1/2"/></ShadcnCardHeader></ShadcnCard>;if(p.variant==='list')return <div className="grid gap-3">{[1,2,3].map(i=><div key={i} className="flex items-center gap-3"><ShadcnSkeleton className="h-10 w-10 rounded-full"/><div className="grid flex-1 gap-2"><ShadcnSkeleton className="h-3 w-full"/><ShadcnSkeleton className="h-3 w-2/3"/></div></div>)}</div>;const rows=lines(p).filter(Boolean);return <div className="grid gap-2">{(rows.length?rows:['a','b','c']).map((_,i)=><ShadcnSkeleton key={i} className="h-4" style={{width:`${80-i*12}%`}}/>)}</div>;},
    notice: p=><ShadcnAlert variant={p.variant==='error'?'destructive':'default'} className="border-l-4" style={{borderLeftColor:noticeBar[p.variant??'']??noticeBar.info}}><ShadcnAlertTitle>{p.title||lab(p)}</ShadcnAlertTitle><ShadcnAlertDescription>{load(p)?'불러오는 중…':empty(p)?'아직 항목이 없습니다':p.text}</ShadcnAlertDescription></ShadcnAlert>,
    breadcrumb: p=><ShadcnBreadcrumbDemo p={p}/>,
    pagination: p=><ShadcnPaginationDemo p={p}/>,
  },
};

export function LibraryComponent({p}:{p:Props}) {
  const [clicked,setClicked]=useState(false);
  const onClick=()=>setClicked(true);
  const table=renderers[(p.provider in renderers?p.provider:'shadcn') as CoverageProvider];
  const inner=(table[p.kind as OfficialKind]??table.button)?.({...p,onClick})??null;
  let component:ReactNode=inner;
  if(p.provider==='mui') {
    const theme=createTheme({palette:{primary:{main:p.accent,...(p.onAccent?{contrastText:p.onAccent}:{})},background:{default:p.background??'#fff',paper:p.background??'#fff'},text:{primary:p.foreground,secondary:p.foreground}},typography:{fontFamily:'Arial, Helvetica, sans-serif'},shape:{borderRadius:p.radius}});
    component=<ThemeProvider theme={theme}>{inner}</ThemeProvider>;
  } else if(p.provider==='astryx') component=<Theme theme={neutralTheme} mode="light">{inner}</Theme>;
  return <section style={{padding:'8px 0',color:p.foreground,fontFamily:'Arial,sans-serif'}}><style>{'@media(max-width:500px){.vendor-cards{grid-template-columns:1fr!important}}'}</style>{component}{clicked?<p role="status" style={{color:p.foreground,WebkitTextFillColor:p.foreground,fontSize:12,margin:'8px 0'}}>선택했습니다 · 프로토타입 동작</p>:null}</section>;
}
const root=document.getElementById('root')!;
const props=root.dataset.props?JSON.parse(root.dataset.props) as Props:window.aphroditeProps;
createRoot(root).render(<LibraryComponent p={props}/>);
