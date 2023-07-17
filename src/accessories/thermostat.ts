import { Service, CharacteristicValue } from 'homebridge';
import { SmartRentPlatform } from '../platform';
import type { SmartRentAccessory } from '.';
import {
  Thermostat,
  ThermostatAttributes,
  ThermostatMode,
  ThermostatFanMode,
} from './../devices';
import { WSEvent } from '../lib/client';

export class ThermostatAccessory {
  private thermostatService: Service;
  private fanService: Service;

  private state: {
    hubId: string;
    deviceId: string;
    heating_cooling_state: {
      current: CharacteristicValue;
      target: CharacteristicValue;
    };
    current_temperature: {
      current: CharacteristicValue;
    };
    target_temperature: {
      current: CharacteristicValue;
      target: CharacteristicValue;
    };
    temperature_display_units: {
      current: CharacteristicValue;
      target: CharacteristicValue;
    };
    current_relative_humidity: {
      current: CharacteristicValue;
    };
    cooling_threshold_temperature: {
      current: CharacteristicValue;
      target: CharacteristicValue;
    };
    heating_threshold_temperature: {
      current: CharacteristicValue;
      target: CharacteristicValue;
    };
    fan_on: {
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
      heating_cooling_state: {
        current: this.platform.Characteristic.CurrentHeatingCoolingState.OFF,
        target: this.platform.Characteristic.TargetHeatingCoolingState.OFF,
      },
      current_temperature: {
        current: -270,
      },
      target_temperature: {
        current: 10,
        target: 10,
      },
      temperature_display_units: {
        current:
          this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT,
        target: this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT,
      },
      current_relative_humidity: {
        current: 0,
      },
      cooling_threshold_temperature: {
        current: 10,
        target: 10,
      },
      heating_threshold_temperature: {
        current: 0,
        target: 0,
      },
      fan_on: {
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

    // get the Thermostat service if it exists, otherwise create a new Thermostat service
    this.thermostatService =
      this.accessory.getService(this.platform.Service.Thermostat) ||
      this.accessory.addService(this.platform.Service.Thermostat);

    // set the service name, this is what is displayed as the default name on the Home app
    this.thermostatService.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name
    );

    // create handlers for required characteristics
    this.thermostatService
      .getCharacteristic(
        this.platform.Characteristic.CurrentHeatingCoolingState
      )
      .onGet(this.handleCurrentHeatingCoolingStateGet.bind(this));

    this.thermostatService
      .getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onGet(this.handleTargetHeatingCoolingStateGet.bind(this))
      .onSet(this.handleTargetHeatingCoolingStateSet.bind(this));

    this.thermostatService
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.handleCurrentTemperatureGet.bind(this));

    this.thermostatService
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onGet(this.handleTargetTemperatureGet.bind(this))
      .onSet(this.handleTargetTemperatureSet.bind(this));

    this.thermostatService
      .getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onGet(this.handleTemperatureDisplayUnitsGet.bind(this))
      .onSet(this.handleTemperatureDisplayUnitsSet.bind(this));

    this.thermostatService
      .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.handleCurrentRelativeHumidityGet.bind(this));

    this.thermostatService
      .getCharacteristic(
        this.platform.Characteristic.CoolingThresholdTemperature
      )
      .onGet(this.handleCoolingThresholdTemperatureGet.bind(this))
      .onSet(this.handleCoolingThresholdTemperatureSet.bind(this));

    this.thermostatService
      .getCharacteristic(
        this.platform.Characteristic.HeatingThresholdTemperature
      )
      .onGet(this.handleHeatingThresholdTemperatureGet.bind(this))
      .onSet(this.handleHeatingThresholdTemperatureSet.bind(this));

    // get the Fan service if it exists, otherwise create a new Fan service
    this.fanService =
      this.accessory.getService(this.platform.Service.Fan) ||
      this.accessory.addService(this.platform.Service.Fan);

    // set the service name, this is what is displayed as the default name on the Home app
    this.fanService.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.name
    );

    // create handlers for required characteristics
    this.fanService
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.handleOnGet.bind(this))
      .onSet(this.handleOnSet.bind(this));

    this.platform.smartRentApi.websocket.event[this.state.deviceId] = (
      event: WSEvent
    ) => this.handleDeviceStateChanged(event);
  }

  private handleDeviceStateChanged(event: WSEvent) {
    this.platform.log.debug(
      `Device ${this.state.deviceId} state changed: ${JSON.stringify(event)}`
    );
    switch (event.name) {
      case 'fan_mode':
        const fanMode = this.toFanOnCharacteristic(
          event.last_read_state as ThermostatFanMode
        );
        this.state.fan_on.current = fanMode;
        this.fanService.updateCharacteristic(
          this.platform.Characteristic.On,
          fanMode
        );
        break;
      case 'mode':
        const mode = this.toTargetHeatingCoolingStateCharacteristic(
          event.last_read_state as ThermostatMode
        );
        let actualMode = mode;
        if (mode === this.platform.Characteristic.TargetHeatingCoolingState.AUTO) {
          // Determine if heating or cooling based on target and current temperature
          if (
            this.state.target_temperature.current <
            this.state.current_temperature.current
          ) {
            actualMode = this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
          } else if (
            this.state.target_temperature.current >
            this.state.current_temperature.current
          ) {
            actualMode = this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
          } else {
            actualMode = this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
          }
        }
        this.state.heating_cooling_state.current = actualMode;
        this.state.heating_cooling_state.target = mode;
        this.thermostatService.updateCharacteristic(
          this.platform.Characteristic.CurrentHeatingCoolingState,
          actualMode
        );
        this.thermostatService.updateCharacteristic(
          this.platform.Characteristic.TargetHeatingCoolingState,
          mode
        );
        break;
      case 'cooling_setpoint':
        const coolingSetpoint = this.toTemperatureCharacteristic(
          Number(event.last_read_state)
        );
        this.state.cooling_threshold_temperature.current = coolingSetpoint;
        this.state.cooling_threshold_temperature.target = coolingSetpoint;
        this.thermostatService.updateCharacteristic(
          this.platform.Characteristic.CoolingThresholdTemperature,
          coolingSetpoint
        );
        break;
      case 'heating_setpoint':
        const heatingSetpoint = this.toTemperatureCharacteristic(
          Number(event.last_read_state)
        );
        this.state.heating_threshold_temperature.current = heatingSetpoint;
        this.state.heating_threshold_temperature.target = heatingSetpoint;
        this.thermostatService.updateCharacteristic(
          this.platform.Characteristic.HeatingThresholdTemperature,
          heatingSetpoint
        );
        break;
      case 'current_temp':
        const temperature = this.toTemperatureCharacteristic(
          Number(event.last_read_state)
        );
        this.state.current_temperature.current = temperature;
        this.thermostatService.updateCharacteristic(
          this.platform.Characteristic.CurrentTemperature,
          temperature
        );
        break;
      case 'current_humidity':
        const humidity = Math.round(Number(event.last_read_state));
        this.state.current_relative_humidity.current = humidity;
        this.thermostatService.updateCharacteristic(
          this.platform.Characteristic.CurrentRelativeHumidity,
          humidity
        );
        break;
    }
  }

  private toCurrentHeatingCoolingStateCharacteristic(
    thermostatMode: ThermostatMode
  ) {
    switch (thermostatMode) {
      case 'off':
        return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
      case 'cool':
        return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
      case 'heat':
        return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      default:
        return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }
  }

  private toTargetHeatingCoolingStateCharacteristic(
    thermostatMode: ThermostatMode
  ) {
    switch (thermostatMode) {
      case 'off':
        return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
      case 'cool':
        return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
      case 'heat':
        return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
      case 'auto':
        return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
      default:
        return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }
  }

  private fromTargetHeatingCoolingStateCharacteristic(
    targetHeatingCoolingState
  ): ThermostatMode {
    switch (targetHeatingCoolingState) {
      case this.platform.Characteristic.TargetHeatingCoolingState.OFF:
        return 'off';
      case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
        return 'cool';
      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
        return 'heat';
      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
        return 'auto';
      default:
        return 'off';
    }
  }

  private toTargetTemperatureCharacteristic(
    thermostatAttributes: ThermostatAttributes
  ) {
    const { cool_target_temp, heat_target_temp, mode } = thermostatAttributes;
    switch (mode) {
      case 'off':
      case 'cool':
        return this.toTemperatureCharacteristic(cool_target_temp);
      case 'heat':
      case 'auto':
      default:
        return this.toTemperatureCharacteristic(heat_target_temp);
    }
  }

  private fromTargetTemperatureCharacteristic(temperature: number): {
    cool_target_temp?: number;
    heat_target_temp?: number;
  } {
    const target_temp = this.fromTemperatureCharacteristic(temperature);
    switch (this.state.heating_cooling_state.current) {
      case this.platform.Characteristic.TargetHeatingCoolingState.OFF:
      case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
        return { cool_target_temp: target_temp };

      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
        return { heat_target_temp: target_temp };

      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
      default:
        return {};
    }
  }

  private fromTemperatureCharacteristic(temperature: number) {
    // this.platform.log.debug("fromTemperatureCharacteristic" + temperature + "=>" + (temperature * 9) / 5 + 32);
    return (temperature * 9) / 5 + 32;
  }

  private toTemperatureCharacteristic(temperature: number) {
    // this.platform.log.debug("toTemperatureCharacteristic" + temperature + "=>" + ((temperature - 32) * 5) / 9);
    return ((temperature - 32) * 5) / 9;
  }

  private fromFanOnCharacteristic(on: boolean): ThermostatFanMode {
    return on ? 'on' : 'auto';
  }

  private toFanOnCharacteristic(thermostatFanMode: ThermostatFanMode) {
    switch (thermostatFanMode) {
      case 'on':
        return true;
      case 'auto':
        return false;
      default:
        return false;
    }
  }

  /**
   * Handle requests to get the current value of the "Current Heating Cooling State" characteristic
   */
  async handleCurrentHeatingCoolingStateGet() {
    this.platform.log.debug('Triggered GET CurrentHeatingCoolingState');

    const thermostatAttributes = (await this.platform.smartRentApi.getState(
      this.state.hubId,
      this.state.deviceId
    )) as ThermostatAttributes;

    const currentValue = this.toCurrentHeatingCoolingStateCharacteristic(
      thermostatAttributes.mode
    );
    this.state.heating_cooling_state.current = currentValue;
    return currentValue;
  }

  /**
   * Handle requests to get the current value of the "Target Heating Cooling State" characteristic
   */
  async handleTargetHeatingCoolingStateGet() {
    this.platform.log.debug('Triggered GET TargetHeatingCoolingState');

    const thermostatAttributes = (await this.platform.smartRentApi.getState(
      this.state.hubId,
      this.state.deviceId
    )) as ThermostatAttributes;

    const currentValue = this.toTargetHeatingCoolingStateCharacteristic(
      thermostatAttributes.mode
    );
    this.state.heating_cooling_state.current = currentValue;
    return currentValue;
  }

  /**
   * Handle requests to set the "Target Heating Cooling State" characteristic
   */
  async handleTargetHeatingCoolingStateSet(value) {
    this.platform.log.debug('Triggered SET TargetHeatingCoolingState:', value);
    this.state.heating_cooling_state.target = value;
    const mode = this.fromTargetHeatingCoolingStateCharacteristic(value);

    const thermostatAttributes = (await this.platform.smartRentApi.setState<
      Thermostat,
      ThermostatAttributes
    >(this.state.hubId, this.state.deviceId, { mode })) as ThermostatAttributes;
    const currentValue = this.toTargetHeatingCoolingStateCharacteristic(
      thermostatAttributes.mode
    );
    this.state.heating_cooling_state.current = currentValue;
  }

  /**
   * Handle requests to get the current value of the "Current Temperature" characteristic
   */
  async handleCurrentTemperatureGet() {
    this.platform.log.debug('Triggered GET CurrentTemperature');

    const thermostatAttributes = (await this.platform.smartRentApi.getState(
      this.state.hubId,
      this.state.deviceId
    )) as ThermostatAttributes;

    const currentValue = this.toTemperatureCharacteristic(
      thermostatAttributes.current_temp
    );
    this.state.current_temperature.current = currentValue;
    return currentValue;
  }

  /**
   * Handle requests to get the current value of the "Target Temperature" characteristic
   */
  async handleTargetTemperatureGet() {
    this.platform.log.debug('Triggered GET TargetTemperature');

    const thermostatAttributes = (await this.platform.smartRentApi.getState(
      this.state.hubId,
      this.state.deviceId
    )) as ThermostatAttributes;

    const currentValue =
      this.toTargetTemperatureCharacteristic(thermostatAttributes);
    this.state.target_temperature.current = currentValue;
    return currentValue;
  }

  /**
   * Handle requests to set the "Target Temperature" characteristic
   */
  async handleTargetTemperatureSet(value) {
    this.platform.log.debug('Triggered SET TargetTemperature:', value);
    this.state.target_temperature.target = value;
    const target_temp_attributes =
      this.fromTargetTemperatureCharacteristic(value);
    const thermostatAttributes = (await this.platform.smartRentApi.setState<
      Thermostat,
      ThermostatAttributes
    >(
      this.state.hubId,
      this.state.deviceId,
      target_temp_attributes
    )) as ThermostatAttributes;

    const currentValue =
      this.toTargetTemperatureCharacteristic(thermostatAttributes);
    this.state.target_temperature.current = currentValue;
  }

  /**
   * Handle requests to get the current value of the "Temperature Display Units" characteristic
   */
  async handleTemperatureDisplayUnitsGet() {
    this.platform.log.debug('Triggered GET TemperatureDisplayUnits');

    // set this to a valid value for TemperatureDisplayUnits
    const currentValue =
      this.platform.Characteristic.TemperatureDisplayUnits.FAHRENHEIT;
    return currentValue;
  }

  /**
   * Handle requests to set the "Temperature Display Units" characteristic
   */
  async handleTemperatureDisplayUnitsSet(value) {
    this.platform.log.debug('Triggered SET TemperatureDisplayUnits:', value);
  }

  /**
   * Handle requests to get the current value of the "Current Relative Humidity" characteristic
   */
  async handleCurrentRelativeHumidityGet() {
    this.platform.log.debug('Triggered GET CurrentRelativeHumidity');

    const thermostatAttributes = (await this.platform.smartRentApi.getState(
      this.state.hubId,
      this.state.deviceId
    )) as ThermostatAttributes;

    const currentValue = thermostatAttributes.current_humidity;
    this.state.current_relative_humidity.current = currentValue;
    return currentValue;
  }

  /**
   * Handle requests to get the current value of the "Cooling Threshold Temperature" characteristic
   */
  async handleCoolingThresholdTemperatureGet() {
    this.platform.log.debug('Triggered GET CoolingThresholdTemperature');

    const thermostatAttributes = (await this.platform.smartRentApi.getState(
      this.state.hubId,
      this.state.deviceId
    )) as ThermostatAttributes;

    const currentValue = this.toTemperatureCharacteristic(
      thermostatAttributes.cool_target_temp
    );
    this.state.cooling_threshold_temperature.current = currentValue;
    return currentValue;
  }

  /**
   * Handle requests to set the "Cooling Threshold Temperature" characteristic
   */
  async handleCoolingThresholdTemperatureSet(value) {
    this.platform.log.debug(
      'Triggered SET CoolingThresholdTemperature:',
      value
    );

    this.state.cooling_threshold_temperature.target = value;
    const cool_target_temp = this.fromTemperatureCharacteristic(value);
    const thermostatAttributes = (await this.platform.smartRentApi.setState<
      Thermostat,
      ThermostatAttributes
    >(this.state.hubId, this.state.deviceId, {
      cool_target_temp,
    })) as ThermostatAttributes;

    const currentValue = this.toTemperatureCharacteristic(
      thermostatAttributes.cool_target_temp
    );
    this.state.heating_threshold_temperature.current = currentValue;
  }

  /**
   * Handle requests to get the current value of the "Heating Threshold Temperature" characteristic
   */
  async handleHeatingThresholdTemperatureGet() {
    this.platform.log.debug('Triggered GET HeatingThresholdTemperature');

    const thermostatAttributes = (await this.platform.smartRentApi.getState(
      this.state.hubId,
      this.state.deviceId
    )) as ThermostatAttributes;

    const currentValue = this.toTemperatureCharacteristic(
      thermostatAttributes.heat_target_temp
    );
    this.state.heating_threshold_temperature.current = currentValue;
    return currentValue;
  }

  /**
   * Handle requests to set the "Heating Threshold Temperature" characteristic
   */
  async handleHeatingThresholdTemperatureSet(value) {
    this.platform.log.debug(
      'Triggered SET HeatingThresholdTemperature:',
      value
    );

    this.state.heating_threshold_temperature.target = value;
    const heat_target_temp = this.fromTemperatureCharacteristic(value);
    const thermostatAttributes = (await this.platform.smartRentApi.setState<
      Thermostat,
      ThermostatAttributes
    >(this.state.hubId, this.state.deviceId, {
      heat_target_temp,
    })) as ThermostatAttributes;

    const currentValue = this.toTemperatureCharacteristic(
      thermostatAttributes.heat_target_temp
    );
    this.state.heating_threshold_temperature.current = currentValue;
  }

  /**
   * Handle requests to get the current value of the "On" characteristic
   */
  async handleOnGet() {
    this.platform.log.debug('Triggered GET On');

    const thermostatAttributes = (await this.platform.smartRentApi.getState(
      this.state.hubId,
      this.state.deviceId
    )) as ThermostatAttributes;

    const currentValue = this.toFanOnCharacteristic(
      thermostatAttributes.fan_mode
    );
    this.state.fan_on.current = currentValue;
    return currentValue;
  }

  /**
   * Handle requests to set the "On" characteristic
   */
  async handleOnSet(value) {
    this.platform.log.debug('Triggered SET On:', value);

    this.state.fan_on.target = value;
    const fan_mode = this.fromFanOnCharacteristic(value);

    const thermostatAttributes = (await this.platform.smartRentApi.setState<
      Thermostat,
      ThermostatAttributes
    >(this.state.hubId, this.state.deviceId, {
      fan_mode,
    })) as ThermostatAttributes;
    const currentValue = this.toFanOnCharacteristic(
      thermostatAttributes.fan_mode
    );
    this.state.fan_on.current = currentValue;
  }
}
