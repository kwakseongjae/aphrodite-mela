/**
 * Closing the window, one request at a time (0.3-P3-fix5 #1, 0.3-R ⑤). A request while a close is under way is part of
 * it and decides nothing. A close whose save fails, or does not finish within `limit`, leaves the window and asks the
 * person, in a dialog of the system's own (`ask`): keep the board as a file and close, close without saving, or stay.
 * Nothing closes unsaved but that answer: no second press, nothing timed to when a warning is painted. A save that
 * finishes after its time is up no longer closes the window; the answer does. A close is under way (busy) from its request
 * until it is over or answered, and no longer: agents' writes are turned away for that time only (0.3-R fix 4 #2).
 */
export type CloseAnswer='save-file'|'discard'|'cancel';
export type WindowCloser={request(destroy:()=>Promise<void>):Promise<void>;busy():boolean};
/** A save not finished in its time: it may still land, so it is asked about as still under way, not as failed (0.3-R fix 5 #2). */
export class StillSaving extends Error {}
/** The window would not go when asked: the save is not what failed, so it is said as it is, not asked about (0.3-R fix 6 #2). */
export class WindowRefused extends Error {}
/** How long a close waits for the save before it asks. */
export const SAVE_LIMIT=10_000;
/** `goLimit`: how long the window is given to go once asked; past it the close is over and said as refused (0.3-R fix 7 #2). */
export function windowCloser(close:(destroy:()=>Promise<void>,answered?:()=>boolean)=>Promise<void|boolean>,ask:(error:unknown)=>Promise<CloseAnswer>,keep:()=>Promise<boolean>,limit=SAVE_LIMIT,goLimit=SAVE_LIMIT):WindowCloser{
  let run:Promise<void>|undefined;
  return{
    request(destroy){if(run)return run;
      run=(async()=>{
        let late=false,saved=false,timer:ReturnType<typeof setTimeout>|undefined;
        // The window's going is asked for once, whoever asks for it (0.3-R fix 5 #2).
        let going:Promise<void>|undefined;
        const go=()=>going??=(async()=>{let stop:ReturnType<typeof setTimeout>|undefined;
          try{await Promise.race([destroy(),new Promise<never>((_,reject)=>{stop=setTimeout(()=>reject(new WindowRefused(`the window did not close in ${Math.round(goLimit/1000)} seconds`)),goLimit);})]);}
          catch(error){throw error instanceof WindowRefused?error:new WindowRefused(error instanceof Error?error.message:String(error));}
          finally{clearTimeout(stop);}})();
        const timeUp=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{late=true;reject(new StillSaving(`the save did not finish in ${Math.round(limit/1000)} seconds`));},limit);});
        // `answered` tells a close whose turn comes after its time is up that the person has been asked: it does nothing then (0.3-R fix 3 #8).
        // A close that saved says so (true), whether or not its time was up by then.
        const closing=close(async()=>{if(!late)await go();},()=>late).then(done=>{saved=done===true;});
        try{await Promise.race([closing,timeUp]);}
        catch(error){
          // Looked at once more before the person is asked: a save that landed as the time ran out closes the window (0.3-R fix 4 #2),
          // and a window already going is not asked about.
          await Promise.race([closing.catch(()=>{}),new Promise(r=>setTimeout(r,0))]);
          if(going||saved){await go();return;}
          for(let why=error;;){
            const answer=await ask(why);
            if(answer==='cancel')return;
            if(answer==='discard'){await go();return;}
            // A file that could not be kept is asked about again, inside this question (0.3-R fix 2 #15).
            let kept=false;try{kept=await keep();}catch(error){why=error;continue;}
            if(kept){await go();return;}
            why=new Error('the board was not saved as a file');
          }
        }
        finally{clearTimeout(timer);run=undefined;}
      })();return run;},
    busy(){return !!run;},
  };
}
/**
 * The system's requests to close the window (0.3-R fix 7 #3): each is held and goes through the closer. One that comes while
 * the window is going asks nothing more of it; a going that was refused, or did not happen in its time, lets the next request
 * through again, so the person can always ask once more.
 */
export function closeRequests(closer:WindowCloser,destroy:()=>Promise<void>,said:(error:unknown)=>void,first:()=>void=()=>{}):(event:{preventDefault():void})=>Promise<void>{
  let closing=false;
  return async event=>{
    event.preventDefault();
    if(closing)return;
    first();
    await closer.request(async()=>{closing=true;try{await destroy();}catch(error){closing=false;throw error;}}).catch(error=>{closing=false;said(error);});
  };
}
