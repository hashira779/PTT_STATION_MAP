/**
 * ============================================================
 *  PTT Station Map — Central Configuration
 *  Single source of truth for settings, assets, schedules, and groups.
 * ============================================================
 */
var PTT_CONFIG = (function () {
  "use strict";

  var DATA_BASE_URL = "./data/";
  var IMAGE_BASE_URL = "./pictures/";
  var PROMOTION_IMAGE_BASE_URL = "./pictures/promotion/";
  var SCHEDULE_CONFIG_URL = DATA_BASE_URL + "schedule_config.json";

  var BING_MAPS_KEY =
    "AhQxc3Nm4Sfv53x7JRXUoj76QZnlm7VWkT5qAigmHQo8gjeYFthvGgEqVcjO5c7C";

  var MAP_CENTER = [11.55, 104.91];
  var MAP_ZOOM = 7;
  var DETAIL_ZOOM = 15;
  var FLY_DURATION = 1;
  var TIMEZONE = "Asia/Phnom_Penh";
  var GEOLOCATION_OPTIONS = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 2000,
  };
  var LIVE_LOCATION_MIN_DISTANCE_METERS = 2;

  var DEFAULT_OPERATION_SCHEDULES = {
    "24h": {
      key: "24h",
      label: "Open 24h",
      is24h: true,
      openHour: 0,
      openMinute: 0,
      closeHour: 0,
      closeMinute: 0,
    },
    "16h": {
      key: "16h",
      label: "Open 5:00 AM - 3:30 PM",
      is24h: false,
      openHour: 5,
      openMinute: 0,
      closeHour: 15,
      closeMinute: 30,
    },
  };

  var DEFAULT_SCHEDULE = "16h";
  var runtimeDefaultScheduleKey = DEFAULT_SCHEDULE;
  var STATUS_ALIASES = {
    "16": "16h",
    "24": "24h",
  };

  var SPECIAL_STATUSES = {
    "under construct": {
      iconUrl: IMAGE_BASE_URL + "61.png",
      iconClass: "fa-tools",
      badgeClass: "bg-warning text-white blink-border",
      displayText: "Under Construction",
    },
    "brand change": {
      iconUrl: IMAGE_BASE_URL + "brand_change.png",
      iconClass: "fa-info-circle",
      badgeClass: "bg-primary text-white",
      displayText: "Changing Brands",
    },
    "off fleet card": {
      iconUrl: IMAGE_BASE_URL + "fleet_card_off.png",
      iconClass: "fa-info-circle",
      badgeClass: "bg-primary text-white",
      displayText: "Fleet Card Unavailable",
    },
  };

  var IMAGE_MAPPING = {
    Amazon: "amazon.png",
    "7-Eleven": "7eleven.png",
    "Fleet card": "fleet.png",
    KHQR: "KHQR.png",
    Cash: "cash.png",
    EV: "ev.png",
    Onion: "onion.png",
    "ULG 95": "ULG95.png",
    "ULR 91": "ULR91.png",
    HSD: "HSD.png",
    Otr: "OTR.png",
    "24h": "24h.png",
    "16h": "16h.png",
    "Under Maintenance": "maintenance.png",
    "brand change": "close.png",
    "off fleet card": "close.png",
  };

  var PRODUCT_ICONS = {
    "ULR 91": IMAGE_BASE_URL + "ULR91.png",
    "ULG 95": IMAGE_BASE_URL + "ULG95.png",
    HSD: IMAGE_BASE_URL + "HSD.png",
    EV: IMAGE_BASE_URL + "ev.png",
    Onion: IMAGE_BASE_URL + "onion.png",
  };

  var ITEM_ICONS = {
    "Fleet card": IMAGE_BASE_URL + "fleet.png",
    KHQR: IMAGE_BASE_URL + "KHQR.png",
    Cash: IMAGE_BASE_URL + "cash.png",
    Amazon: IMAGE_BASE_URL + "amazon.png",
    "7-Eleven": IMAGE_BASE_URL + "7eleven.png",
    Otr: IMAGE_BASE_URL + "OTR.png",
  };

  var PROMOTION_IMAGES = {
    "promotion 1": PROMOTION_IMAGE_BASE_URL + "promotion_1.jpg",
    "promotion 2": PROMOTION_IMAGE_BASE_URL + "promotion_2.jpg",
    "promotion 3": PROMOTION_IMAGE_BASE_URL + "promotion_3.jpg",
    "promotion 4": PROMOTION_IMAGE_BASE_URL + "promotion_4.jpg",
    "promotion opening 1": PROMOTION_IMAGE_BASE_URL + "promotion_opening_1.jpg",
    "promotion opening 2": PROMOTION_IMAGE_BASE_URL + "promotion_opening_2.jpg",
    "promotion opening 3": PROMOTION_IMAGE_BASE_URL + "promotion_opening_3.jpg",
    "promotion opening 4": PROMOTION_IMAGE_BASE_URL + "promotion_opening_4.jpg",
  };

  var runtimeSchedules = JSON.parse(JSON.stringify(DEFAULT_OPERATION_SCHEDULES));
  var runtimeGroups = [];

  function normalizeScheduleKey(value) {
    if (value == null) return "";
    var raw = String(value).trim();
    return STATUS_ALIASES[raw.toLowerCase()] || raw;
  }

  function setScheduleConfig(config) {
    var schedules = config && config.schedules ? config.schedules : DEFAULT_OPERATION_SCHEDULES;
    var groups = config && config.groups ? config.groups : [];
    var requestedDefaultKey = normalizeScheduleKey(
      (config && config.default_schedule_key) || DEFAULT_SCHEDULE
    );

    runtimeSchedules = {};
    Object.keys(schedules).forEach(function (rawKey) {
      var schedule = schedules[rawKey] || {};
      var key = normalizeScheduleKey(schedule.key || rawKey);
      runtimeSchedules[key] = {
        key: key,
        label: schedule.label || key,
        is24h: !!schedule.is24h,
        openHour: Number(schedule.openHour || 0),
        openMinute: Number(schedule.openMinute || 0),
        closeHour: Number(schedule.closeHour || 0),
        closeMinute: Number(schedule.closeMinute || 0),
      };
    });

    runtimeDefaultScheduleKey = runtimeSchedules[requestedDefaultKey]
      ? requestedDefaultKey
      : Object.keys(runtimeSchedules)[0] || DEFAULT_SCHEDULE;

    runtimeGroups = (groups || []).map(function (group) {
      var groupScheduleKey = normalizeScheduleKey(group.schedule_key || "");
      return {
        code: String(group.code || "").trim().toUpperCase(),
        name: group.name || String(group.code || "").trim().toUpperCase(),
        schedule_key: runtimeSchedules[groupScheduleKey] ? groupScheduleKey : "",
      };
    }).filter(function (group) {
      return group.code;
    });
  }

  function getOperationSchedules() {
    return runtimeSchedules;
  }

  function getScheduleGroups() {
    return runtimeGroups.slice();
  }

  function getScheduleGroup(code) {
    var normalized = String(code || "").trim().toUpperCase();
    return runtimeGroups.find(function (group) {
      return group.code === normalized;
    }) || null;
  }

  function getDefaultScheduleKey() {
    return runtimeDefaultScheduleKey;
  }

  setScheduleConfig({ schedules: DEFAULT_OPERATION_SCHEDULES, groups: [] });

  return {
    DATA_BASE_URL: DATA_BASE_URL,
    IMAGE_BASE_URL: IMAGE_BASE_URL,
    PROMOTION_IMAGE_BASE_URL: PROMOTION_IMAGE_BASE_URL,
    SCHEDULE_CONFIG_URL: SCHEDULE_CONFIG_URL,
    BING_MAPS_KEY: BING_MAPS_KEY,
    MAP_CENTER: MAP_CENTER,
    MAP_ZOOM: MAP_ZOOM,
    DETAIL_ZOOM: DETAIL_ZOOM,
    FLY_DURATION: FLY_DURATION,
    TIMEZONE: TIMEZONE,
    GEOLOCATION_OPTIONS: GEOLOCATION_OPTIONS,
    LIVE_LOCATION_MIN_DISTANCE_METERS: LIVE_LOCATION_MIN_DISTANCE_METERS,
    DEFAULT_OPERATION_SCHEDULES: DEFAULT_OPERATION_SCHEDULES,
    DEFAULT_SCHEDULE: DEFAULT_SCHEDULE,
    STATUS_ALIASES: STATUS_ALIASES,
    SPECIAL_STATUSES: SPECIAL_STATUSES,
    IMAGE_MAPPING: IMAGE_MAPPING,
    PRODUCT_ICONS: PRODUCT_ICONS,
    ITEM_ICONS: ITEM_ICONS,
    PROMOTION_IMAGES: PROMOTION_IMAGES,
    setScheduleConfig: setScheduleConfig,
    getOperationSchedules: getOperationSchedules,
    getScheduleGroups: getScheduleGroups,
    getScheduleGroup: getScheduleGroup,
    getDefaultScheduleKey: getDefaultScheduleKey,
    normalizeScheduleKey: normalizeScheduleKey,
  };
})();
