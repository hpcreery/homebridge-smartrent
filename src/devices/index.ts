import { LeakSensorData } from './leakSensor';
import { LockData } from './lock';
import { SwitchData } from './switch';
import { SwitchMultilevelData } from './switchMultilevel';
import { ThermostatData } from './thermostat';

export * from './base';
export * from './leakSensor';
export * from './lock';
export * from './switch';
export * from './thermostat';
export * from './switchMultilevel';

export type DeviceDataUnion =
  | LeakSensorData
  | LockData
  | SwitchData
  | ThermostatData
  | SwitchMultilevelData;
