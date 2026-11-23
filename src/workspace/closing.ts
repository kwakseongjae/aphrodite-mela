/**
 * Closing the window, one request at a time (0.3-P3-fix5 #1). A request while a close is under way is part of it and
 * decides nothing. A close whose save fails leaves the window and warns; only a request made once that warning is on
 * the screen closes without saving. When saves land again (saved()), the next close saves first, as before.
 */
export type WindowCloser={request(destroy:()=>Promise<void>):Promise<void>;saved():void;busy():boolean};
export function windowCloser(close:(destroy:()=>Promise<void>)=>Promise<void>,warn:(error:unknown)=>void,drawn:()=>Promise<void>):WindowCloser{
  let run:Promise<void>|undefined,warned=false;
  return{
    request(destroy){if(run)return run;if(warned){warned=false;return destroy();}
      run=(async()=>{try{await close(destroy);}catch(error){warn(error);await drawn();warned=true;}finally{run=undefined;}})();return run;},
    saved(){warned=false;},
    busy(){return !!run;},
  };
}
