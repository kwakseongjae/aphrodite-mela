/**
 * Closing the window, one request at a time (0.3-P3-fix5 #1, 0.3-R ⑤). A request while a close is under way is part of
 * it and decides nothing. A close whose save fails, or does not finish within `limit`, leaves the window and asks the
 * person, in a dialog of the system's own (`ask`): keep the board as a file and close, close without saving, or stay.
 * Nothing closes unsaved but that answer: no second press, nothing timed to when a warning is painted. A save that
 * finishes after its time is up no longer closes the window; the answer does.
 */
export type CloseAnswer='save-file'|'discard'|'cancel';
export type WindowCloser={request(destroy:()=>Promise<void>):Promise<void>;busy():boolean};
/** How long a close waits for the save before it asks. */
export const SAVE_LIMIT=10_000;
export function windowCloser(close:(destroy:()=>Promise<void>)=>Promise<void>,ask:(error:unknown)=>Promise<CloseAnswer>,keep:()=>Promise<boolean>,limit=SAVE_LIMIT):WindowCloser{
  let run:Promise<void>|undefined;
  return{
    request(destroy){if(run)return run;
      run=(async()=>{
        let late=false,timer:ReturnType<typeof setTimeout>|undefined;
        const timeUp=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{late=true;reject(new Error(`the save did not finish in ${Math.round(limit/1000)} seconds`));},limit);});
        try{await Promise.race([close(async()=>{if(!late)await destroy();}),timeUp]);}
        catch(error){
          for(let why=error;;){
            const answer=await ask(why);
            if(answer==='cancel')return;
            if(answer==='discard'){await destroy();return;}
            if(await keep()){await destroy();return;}
            why=new Error('the board was not saved as a file');
          }
        }
        finally{clearTimeout(timer);run=undefined;}
      })();return run;},
    busy(){return !!run;},
  };
}
