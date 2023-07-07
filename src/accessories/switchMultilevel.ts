import { Service, CharacteristicValue } from 'homebridge';
import { SmartRentPlatform } from '../platform';
import type { SmartRentAccessory } from '.';
import { SwitchMultilevel, SwitchMultilevelAttributes } from '../devices';
import { WSEvent } from '../lib/client';

/**
 * Switch Muiltilevel Accessory
 * An instance of this class is created for each accessory the platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class SwitchMultilevelAccessory {
  private service: Service;

  private state: {
    hubId: string;
    deviceId: string;
    on: {
      current: CharacteristicValue;
      target: CharacteristicValue;
    };
    brightness: {
      current: CharacteristicValue;
      target: CharacteristicValue;
    };
  };

  constructor(
    private readonly platform: SmartRentPlatform,
    private readonly accessory: SmartRentAccessory
  ) {
    this.state = {
      hubId: this.accessory.context.device.room.hub_id.toString(),
      deviceId: this.accessory.context.device.id.toString(),
      on: {
        current: 0,
        target: 0,
      },
      brightness: {
        current: 0,
        target: 0,
      },
    };

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.accessory.context.device.id.toString()
      );

    // get the Switch Multilevel service if it exists, otherwise create a new Switch Multilevel service
    this.service =
      this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb);

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name
    );

    // create handlers for required characteristics
    // see https://developers.homebridge.io/#/service/Lightbulb
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.handleOnGet.bind(this))
      .onSet(this.handleOnSet.bind(this));

    this.service
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .onGet(this.handleBrightnessGet.bind(this))
      .onSet(this.handleBrightnessSet.bind(this));

    // subscribe to device state changed events
    this.platform.smartRentApi.websocket.event[this.state.deviceId] = (
      event: WSEvent
    ) => this.handleDeviceStateChanged(event);
  }

  /**
   * Handle device state changed events
   */
  async handleDeviceStateChanged(event: WSEvent) {
    this.platform.log.debug(
      'Received websocket Switch Multilevel event:',
      event
    );
    switch (event.name) {
      case 'on':
        // TODO FIX
        this.state.on.current = 0;

        this.service.updateCharacteristic(
          this.platform.Characteristic.On,
          this.state.on.current
        );
        break;
      default:
        break;
    }
  }

  /**
   * Handle requests to get the current value of the "On" characteristic
   */
  async handleOnGet(): Promise<CharacteristicValue> {
    this.platform.log.debug('Triggered GET On');
    const switchMultilevelAttributes =
      await this.platform.smartRentApi.getState(
        this.state.hubId,
        this.state.deviceId
      );
    const level = Number(switchMultilevelAttributes.level) > 0 ? 1 : 0;
    this.state.on.current = level;
    return level;
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async handleOnSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET On:', value);
    this.state.on.target = value === true ? 1 : 0;
    const switchMultilevelAttributes =
      await this.platform.smartRentApi.setState<
        SwitchMultilevel,
        SwitchMultilevelAttributes
      >(this.state.hubId, this.state.deviceId, {
        level: value === true ? 100 : 0,
      });
    const level = Number(switchMultilevelAttributes.level) > 0 ? 1 : 0;
    this.state.on.current = level;
  }

  /**
   * Handle requests to get the current value of the "Brightness" characteristic
   */
  async handleBrightnessGet(): Promise<CharacteristicValue> {
    this.platform.log.debug('Triggered GET Brightness');
    const switchMultilevelAttributes =
      await this.platform.smartRentApi.getState(
        this.state.hubId,
        this.state.deviceId
      );
    const level = switchMultilevelAttributes.level as number;
    this.state.on.current = level;
    return level;
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async handleBrightnessSet(value: CharacteristicValue) {
    this.platform.log.debug('Triggered SET Brightness:', value);
    this.state.on.target = value;
    const switchMultilevelAttributes =
      await this.platform.smartRentApi.setState<
        SwitchMultilevel,
        SwitchMultilevelAttributes
      >(this.state.hubId, this.state.deviceId, { level: Number(value) });
    const level = switchMultilevelAttributes.level as number;
    this.state.on.current = level;
  }
}
