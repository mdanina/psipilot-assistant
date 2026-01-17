/**
 * Shared functions for transcript formatting
 * Used by transcribe.js and webhook.js
 */

/**
 * Map role to Russian name
 */
const ROLE_MAP = {
  'doctor': 'Врач',
  'admin': 'Администратор',
  'assistant': 'Ассистент',
  'specialist': 'Специалист'
};

/**
 * Get user role from recording
 * @param {Object} recording - Recording object with user_id
 * @param {Object} supabase - Supabase admin client
 * @returns {Promise<string>} User role in Russian ('Врач', 'Администратор', 'Ассистент')
 */
export async function getUserRoleFromRecording(recording, supabase) {
  try {
    if (!recording?.user_id) {
      console.warn('[transcript-formatting] Recording has no user_id, defaulting to "Специалист"');
      return 'Специалист';
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', recording.user_id)
      .single();

    if (error || !profile) {
      console.warn('[transcript-formatting] Failed to fetch user profile:', error?.message, 'Defaulting to "Специалист"');
      return 'Специалист';
    }

    return ROLE_MAP[profile.role] || 'Специалист';
  } catch (error) {
    console.error('[transcript-formatting] Error getting user role:', error);
    return 'Специалист'; // Default fallback
  }
}

/**
 * Format transcript with speaker labels using user role
 * @param {Array} utterances - Array of utterance objects from AssemblyAI
 * @param {string} userRole - Role of the first user (in Russian)
 * @returns {string} Formatted transcript text
 */
export function formatTranscriptWithSpeakers(utterances, userRole = 'Специалист') {
  if (!utterances || utterances.length === 0) {
    return '';
  }

  const speakerMap = {};
  let speakerIndex = 0;

  // First speaker gets the user's role, second is always "Пациент", others are "Участник N"
  // Extended to support up to 10 speakers
  const getDefaultSpeakerName = (index) => {
    if (index === 0) return userRole;
    if (index === 1) return 'Пациент';
    return `Участник ${index}`;
  };

  return utterances.map(utterance => {
    if (!speakerMap[utterance.speaker]) {
      speakerMap[utterance.speaker] = getDefaultSpeakerName(speakerIndex);
      speakerIndex++;
    }
    return `${speakerMap[utterance.speaker]}: ${utterance.text}`;
  }).join('\n');
}

/**
 * Get display name for a role
 * @param {string} role - Role key (doctor, admin, assistant, specialist)
 * @returns {string} Russian role name
 */
export function getRoleDisplayName(role) {
  return ROLE_MAP[role] || 'Специалист';
}
