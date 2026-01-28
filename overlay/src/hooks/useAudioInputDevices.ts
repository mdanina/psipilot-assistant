import { useState, useCallback, useEffect } from 'react';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

export function useAudioInputDevices() {
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [loading, setLoading] = useState(false);

  const enumerate = useCallback(async () => {
    const list = await navigator.mediaDevices.enumerateDevices();
    const inputs = list
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Микрофон ${d.deviceId.slice(0, 8)}` }));
    setDevices(inputs);
    return inputs;
  }, []);

  /** Запросить доступ к микрофону и обновить список (тогда появятся подписи устройств) */
  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      await enumerate();
    } catch {
      await enumerate();
    } finally {
      setLoading(false);
    }
  }, [enumerate]);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    enumerate();
  }, [enumerate]);

  return { devices, loading, refresh, enumerate };
}
