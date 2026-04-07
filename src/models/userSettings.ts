/** Shared defaults for embedded user app settings (Mongo + API). */

export type ProfileVisibility = 'everyone' | 'drivers_only' | 'minimal';
export type NightModePref = 'system' | 'light' | 'dark';
export type PreferredMaps = 'google' | 'apple' | 'waze';

export type AppSettingsShape = {
  privacy: {
    profileVisibility: ProfileVisibility;
    shareAnalytics: boolean;
  };
  accessibility: {
    reduceMotion: boolean;
    boldText: boolean;
  };
  nightMode: NightModePref;
  shortcuts: { enabled: boolean };
  communication: {
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  navigation: {
    preferredMaps: PreferredMaps;
  };
  soundsVoice: {
    messageSounds: boolean;
    voiceGuidance: boolean;
  };
  /** Trust & trip safety preferences (mobile Safety hub). */
  safety: {
    pinVerificationEnabled: boolean;
    followMyTripEnabled: boolean;
    tripCheckNotificationsEnabled: boolean;
  };
};

export const DEFAULT_APP_SETTINGS: AppSettingsShape = {
  privacy: {
    profileVisibility: 'everyone',
    shareAnalytics: true,
  },
  accessibility: {
    reduceMotion: false,
    boldText: false,
  },
  nightMode: 'system',
  shortcuts: { enabled: true },
  communication: {
    email: true,
    push: true,
    sms: false,
  },
  navigation: {
    preferredMaps: 'google',
  },
  soundsVoice: {
    messageSounds: true,
    voiceGuidance: false,
  },
  safety: {
    pinVerificationEnabled: true,
    followMyTripEnabled: false,
    tripCheckNotificationsEnabled: true,
  },
};

export function mergeAppSettings(partial: unknown): AppSettingsShape {
  const d = DEFAULT_APP_SETTINGS;
  if (!partial || typeof partial !== 'object') {
    return {
      ...d,
      privacy: { ...d.privacy },
      accessibility: { ...d.accessibility },
      shortcuts: { ...d.shortcuts },
      communication: { ...d.communication },
      navigation: { ...d.navigation },
      soundsVoice: { ...d.soundsVoice },
      safety: { ...d.safety },
    };
  }
  const p = partial as Record<string, unknown>;
  const priv = typeof p.privacy === 'object' && p.privacy ? (p.privacy as Record<string, unknown>) : {};
  const acc = typeof p.accessibility === 'object' && p.accessibility ? (p.accessibility as Record<string, unknown>) : {};
  const comm = typeof p.communication === 'object' && p.communication ? (p.communication as Record<string, unknown>) : {};
  const nav = typeof p.navigation === 'object' && p.navigation ? (p.navigation as Record<string, unknown>) : {};
  const sv = typeof p.soundsVoice === 'object' && p.soundsVoice ? (p.soundsVoice as Record<string, unknown>) : {};
  const sh = typeof p.shortcuts === 'object' && p.shortcuts ? (p.shortcuts as Record<string, unknown>) : {};
  const sf = typeof p.safety === 'object' && p.safety ? (p.safety as Record<string, unknown>) : {};

  const vis = priv.profileVisibility;
  const profileVisibility =
    vis === 'everyone' || vis === 'drivers_only' || vis === 'minimal' ? vis : d.privacy.profileVisibility;

  const nm = p.nightMode;
  const nightMode = nm === 'system' || nm === 'light' || nm === 'dark' ? nm : d.nightMode;

  const maps = nav.preferredMaps;
  const preferredMaps =
    maps === 'google' || maps === 'apple' || maps === 'waze' ? maps : d.navigation.preferredMaps;

  return {
    privacy: {
      profileVisibility,
      shareAnalytics: typeof priv.shareAnalytics === 'boolean' ? priv.shareAnalytics : d.privacy.shareAnalytics,
    },
    accessibility: {
      reduceMotion: typeof acc.reduceMotion === 'boolean' ? acc.reduceMotion : d.accessibility.reduceMotion,
      boldText: typeof acc.boldText === 'boolean' ? acc.boldText : d.accessibility.boldText,
    },
    nightMode,
    shortcuts: {
      enabled: typeof sh.enabled === 'boolean' ? sh.enabled : d.shortcuts.enabled,
    },
    communication: {
      email: typeof comm.email === 'boolean' ? comm.email : d.communication.email,
      push: typeof comm.push === 'boolean' ? comm.push : d.communication.push,
      sms: typeof comm.sms === 'boolean' ? comm.sms : d.communication.sms,
    },
    navigation: {
      preferredMaps,
    },
    soundsVoice: {
      messageSounds:
        typeof sv.messageSounds === 'boolean' ? sv.messageSounds : d.soundsVoice.messageSounds,
      voiceGuidance:
        typeof sv.voiceGuidance === 'boolean' ? sv.voiceGuidance : d.soundsVoice.voiceGuidance,
    },
    safety: {
      pinVerificationEnabled:
        typeof sf.pinVerificationEnabled === 'boolean'
          ? sf.pinVerificationEnabled
          : d.safety.pinVerificationEnabled,
      followMyTripEnabled:
        typeof sf.followMyTripEnabled === 'boolean' ? sf.followMyTripEnabled : d.safety.followMyTripEnabled,
      tripCheckNotificationsEnabled:
        typeof sf.tripCheckNotificationsEnabled === 'boolean'
          ? sf.tripCheckNotificationsEnabled
          : d.safety.tripCheckNotificationsEnabled,
    },
  };
}

/** Shallow merge for PATCH body — unknown keys ignored at route layer. */
export function patchAppSettings(base: AppSettingsShape, patch: Partial<AppSettingsShape>): AppSettingsShape {
  return {
    privacy: { ...base.privacy, ...patch.privacy },
    accessibility: { ...base.accessibility, ...patch.accessibility },
    nightMode: patch.nightMode ?? base.nightMode,
    shortcuts: { ...base.shortcuts, ...patch.shortcuts },
    communication: { ...base.communication, ...patch.communication },
    navigation: { ...base.navigation, ...patch.navigation },
    soundsVoice: { ...base.soundsVoice, ...patch.soundsVoice },
    safety: { ...base.safety, ...patch.safety },
  };
}
