import express from 'express';
import { createClient } from '@supabase/supabase-js';
import icalGenerator from 'ical-generator';

const router = express.Router();

/**
 * Helper function to get Supabase admin client
 */
function getSupabaseAdmin() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is required. Please set it in .env file.');
  }

  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required. Please set it in .env file.');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * POST /api/calendar/generate-token
 * Generates a calendar feed token for the current user (requires authentication)
 */
router.post('/generate-token', async (req, res) => {
  try {
    const { id: userId } = req.user;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }

    const supabase = getSupabaseAdmin();

    // Generate or get existing token
    const { data: token, error: tokenError } = await supabase.rpc(
      'get_or_create_calendar_token',
      { p_user_id: userId }
    );

    if (tokenError) {
      console.error('Token generation error:', tokenError);
      return res.status(500).json({ success: false, error: 'Failed to generate token' });
    }

    // Build feed URL
    const apiUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3001}`;
    const feedUrl = `${apiUrl}/api/calendar/feed/${token}`;

    return res.json({
      success: true,
      token,
      feedUrl,
    });

  } catch (error) {
    console.error('Token generation error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/calendar/feed/:token
 * Public endpoint for getting iCal feed (no authentication required, token-based access)
 */
router.get('/feed/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || token.length < 20) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const supabase = getSupabaseAdmin();

    // Update last_accessed_at and get user_id
    const { data: userId, error: accessError } = await supabase.rpc(
      'update_calendar_token_accessed',
      { p_token: token }
    );

    if (accessError || !userId) {
      return res.status(404).json({ error: 'Token not found' });
    }

    // Get user's sessions (appointments)
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select(`
        id,
        scheduled_at,
        duration_minutes,
        status,
        meeting_format
      `)
      .eq('user_id', userId)
      .in('status', ['scheduled', 'in_progress'])
      .gte('scheduled_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .lte('scheduled_at', new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('scheduled_at', { ascending: true });

    if (sessionsError) {
      console.error('Sessions fetch error:', sessionsError);
      return res.status(500).json({ error: 'Failed to fetch sessions' });
    }

    // Generate iCal
    const calendar = icalGenerator({
      name: 'PsiPilot - Мои сессии',
      timezone: 'Europe/Moscow',
      prodId: { company: 'PsiPilot', product: 'Assistant Calendar' },
    });

    for (const session of sessions || []) {
      const startDate = new Date(session.scheduled_at);
      const durationMinutes = session.duration_minutes || 60;
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

      // SECURITY: Use ONLY generic titles in iCal feed - it syncs to cloud services
      // (Google Calendar, iCloud, etc.) which would be a PHI/HIPAA/152-ФЗ violation.
      // session.title may contain patient names or other PHI entered by the therapist.
      let eventTitle = 'Приём';
      if (session.meeting_format === 'online') {
        eventTitle = 'Приём (онлайн)';
      }

      // Build description
      let description = '';
      if (session.meeting_format === 'online') {
        description = 'Формат: Онлайн';
      } else if (session.meeting_format === 'in_person') {
        description = 'Формат: Очно';
      }

      calendar.createEvent({
        start: startDate,
        end: endDate,
        summary: eventTitle,
        description: description || undefined,
        location: session.meeting_format === 'online' ? 'Онлайн' : undefined,
      });
    }

    // Send iCal response
    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="psipilot-calendar.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });

    return res.send(calendar.toString());

  } catch (error) {
    console.error('Calendar feed error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/calendar/revoke-token
 * Revokes the current user's calendar feed token
 */
router.delete('/revoke-token', async (req, res) => {
  try {
    const { id: userId } = req.user;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authorization required' });
    }

    const supabase = getSupabaseAdmin();

    const { error: deleteError } = await supabase
      .from('calendar_feed_tokens')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Token revoke error:', deleteError);
      return res.status(500).json({ success: false, error: 'Failed to revoke token' });
    }

    return res.json({ success: true });

  } catch (error) {
    console.error('Token revoke error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export { router as calendarRoute };
