import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface DBProfile {
  id: string;
  user_id: string;
  username: string;
  is_private: boolean;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  age: number;
  weight: number;
  height: number;
  level: "iniciante" | "intermediario" | "avancado";
  goal: "emagrecimento" | "hipertrofia" | "condicionamento" | "saude_mental" | "alta_performance";
  body_type: "ectomorfo" | "mesomorfo" | "endomorfo";
  sleep_hours: number;
  sleep_quality: "ruim" | "regular" | "boa" | "excelente";
  weekly_frequency: number;
  training_time: "manha" | "tarde" | "noite";
  allergies: string | null;
  dietary_restrictions: string | null;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!error && data) {
      const { data: privateData } = await supabase
        .from("profile_private")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      setProfile({ ...data, ...privateData } as DBProfile);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const updateProfile = async (updates: Partial<DBProfile>) => {
    if (!user) return;
    setProfile(prev => (prev ? { ...prev, ...updates } : prev));

    const {
      age,
      weight,
      height,
      sleep_hours,
      sleep_quality,
      allergies,
      dietary_restrictions,
      ...publicUpdates
    } = updates;
    const privateUpdates = {
      age,
      weight,
      height,
      sleep_hours,
      sleep_quality,
      allergies,
      dietary_restrictions,
    };

    const writes = [];
    if (Object.keys(publicUpdates).length > 0) {
      writes.push(
        supabase.from("profiles").update(publicUpdates).eq("user_id", user.id),
      );
    }
    if (Object.values(privateUpdates).some(value => value !== undefined)) {
      writes.push(
        supabase.from("profile_private").update(privateUpdates).eq("user_id", user.id),
      );
    }

    const results = await Promise.all(writes);
    results.forEach(({ error }) => {
      if (error) console.error(error);
    });
  };

  return { profile, loading, updateProfile, reload: load };
}
