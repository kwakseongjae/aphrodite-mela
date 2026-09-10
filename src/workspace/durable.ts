/** Serial, revision-aware native writes. A failed queue stays blocked until reload. */
export class DurableQueue{
  private tail:Promise<void>=Promise.resolve();
  private sequence=0;
  constructor(private revision:number,private write:(data:string,expected:number)=>Promise<number>,private status:(saved:boolean,error?:unknown)=>void){}
  enqueue(data:string){const seq=++this.sequence;this.status(false);this.tail=this.tail.then(async()=>{this.revision=await this.write(data,this.revision);if(seq===this.sequence)this.status(true);});void this.tail.catch(error=>{this.status(false,error);});}
  flush(){return this.tail;}
}
