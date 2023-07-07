import { PlatformAccessory } from 'homebridge';
import { DeviceDataUnion } from '../devices';

export * from './leakSensor';
export * from './lock';
export * from './switch';
export * from './thermostat';
export * from './switchMultilevel';

export type AccessoryContext = { device: DeviceDataUnion };
export type SmartRentAccessory = PlatformAccessory<AccessoryContext>;
