import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
if(Capacitor.getPlatform()==='android'){
  (globalThis as typeof globalThis & {TankNative?:unknown}).TankNative={
    async vibrate(cue:'shot'|'hurt'|'pickup'|'death'){
      if(cue==='pickup')await Haptics.notification({type:NotificationType.Success});
      else if(cue==='death')await Haptics.notification({type:NotificationType.Error});
      else await Haptics.impact({style:cue==='hurt'?ImpactStyle.Medium:ImpactStyle.Light});
    }
  };
}
