import { useState, useEffect } from "react";
import type { UserProfile } from "@/lib/workout-generator";

const STORAGE_KEY = "multifit_profile";

const defaultProfile: UserProfile = {
  name: "",
  age: 25,
  weight: 70,
  height: 170,
  level: "iniciante",
  goal: "hipertrofia",
  bodyType: "mesomorfo",
  sleepHours: 7,
  sleepQuality: "boa",
  weeklyFrequency: 4,
  trainingTime: "manha",
};

export function useLocalProfile() {
  const [profile, setProfile] = useState<UserProfile>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...defaultProfile, ...JSON.parse(stored) } : defaultProfile;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  const updateProfile = (updates: Partial<UserProfile>) => {
    setProfile(prev => ({ ...prev, ...updates }));
  };

  const isProfileComplete = profile.name.length > 0;

  return { profile, updateProfile, isProfileComplete };
}
