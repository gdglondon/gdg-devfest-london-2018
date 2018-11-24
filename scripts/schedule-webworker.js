function getTimeDifference(date, startTime, endTime) {
  const timezone = new Date().toString().match(/([A-Z]+[+-][0-9]+.*)/)[1];
  const timeStart = new Date(date + ' ' + startTime + ' ' + timezone).getTime();
  const timeEnd = new Date(date + ' ' + endTime + ' ' + timezone).getTime();
  return timeEnd - timeStart;
}

function getTimeslotMinutesFromStart(date, startOfDay, startTime) {
  const timezone = new Date().toString().match(/([A-Z]+[+-][0-9]+.*)/)[1];
  const timeDayStart = new Date(date + ' ' + startOfDay + ' ' + timezone).getTime();
  const timeTimeslotStart = new Date(date + ' ' + startTime + ' ' + timezone).getTime();
  const millis = timeTimeslotStart - timeDayStart;
  return millis / (1000 * 60);
}

function getEndTime(date, startTime, endTime, totalNumber, number) {
  const timezone = new Date().toString().match(/([A-Z]+[+-][0-9]+.*)/)[1];
  const timeStart = new Date(`${date} ${startTime} ${timezone}`).getTime();
  const difference = Math.floor(getTimeDifference(date, startTime, endTime) / totalNumber);
  const result = new Date(timeStart + difference * number);
  return result.getHours() + ':' + result.getMinutes();
}

function getDuration(date, startTime, endTime) {
  let difference = getTimeDifference(date, startTime, endTime);
  const hh = Math.floor(difference / 1000 / 60 / 60);
  difference -= hh * 1000 * 60 * 60;
  return {
    hh,
    mm: Math.floor(difference / 1000 / 60),
  };
}

function addTagTo(array, element) {
  if (array.indexOf(element) < 0) {
    return [...array, element];
  }
}

function updateSpeakersSessions(speakersRaw, speakerIds, session) {
  let result = {};
  for (let i = 0; i < speakerIds.length; i++) {
    const speaker = speakersRaw[speakerIds[i]];
    if (speaker) {
      result[speakerIds[i]] = Object.assign({}, speaker, {
        sessions: speaker.sessions
          ? speaker.sessions.map((speakerSession) => speakerSession.id === session.id
            ? session
            : speakerSession)
          : [session],
      });
    }
  }
  return result;
}

self.addEventListener('message', ({ data }) => {
  const speakersRaw = data.speakers;
  const sessionsRaw = data.sessions;
  const scheduleRaw = data.schedule;

  let schedule = {};
  let sessions = {};
  let speakers = {};
  let scheduleTags = [];

  for (const dayKey of Object.keys(scheduleRaw)) {
    const day = scheduleRaw[dayKey];
    const tracksNumber = day.tracks.length;
    let dayTags = [];
    let timeslots = [];
    let extensions = {};

    for (let timeslotsIndex = 0, timeslotLen = day.timeslots.length; timeslotsIndex < timeslotLen; timeslotsIndex++) {
      const timeslot = day.timeslots[timeslotsIndex];
      let innnerSessions = [];

      let startGrid = getTimeslotMinutesFromStart(dayKey, day.timeslots[0].startTime, timeslot.endTime) / 5;
      let endGrid = getTimeslotMinutesFromStart(dayKey, day.timeslots[0].startTime, timeslot.startTime) / 5 + 1;
      var timeslotGridSize = `${startGrid} / 1 / ${endGrid} / 2`;

      for (
        let sessionIndex = 0, sessionsLen = timeslot.sessions ? (timeslot.sessions.length ? timeslot.sessions.length : 5) : 0;
        sessionIndex < sessionsLen;
        sessionIndex++
      ) {
        let subsessions = [];

        var sessionStartTime;
        var sessionEndTime;

        if (timeslot.sessions.length || timeslot.sessions[sessionIndex]) {
          let subSessionsLen = timeslot.sessions[sessionIndex] && timeslot.sessions[sessionIndex].items ?
            timeslot.sessions[sessionIndex].items.length :
            0;
          for (
            let subSessionIndex = 0;
            subSessionIndex < subSessionsLen;
            subSessionIndex++
          ) {
            const sessionId = timeslot.sessions[sessionIndex].items[subSessionIndex];
            const subsession = sessionsRaw[sessionId];
            const mainTag = subsession.tags ? subsession.tags[0] : 'General';
            const endTimeRaw = timeslot.sessions[sessionIndex].extend ?
              day.timeslots[timeslotsIndex + timeslot.sessions[sessionIndex].extend - 1].endTime :
              timeslot.endTime;
            const endTime = subSessionsLen > 1 ?
              getEndTime(dayKey, timeslot.startTime, endTimeRaw, subSessionsLen, subSessionIndex + 1) :
              endTimeRaw;
            const startTime = subSessionsLen > 1 && subSessionIndex > 0 ?
              sessions[timeslot.sessions[sessionIndex].items[subSessionIndex - 1]].endTime :
              timeslot.startTime;

            if (subSessionIndex === 0) {
              sessionStartTime = startTime;
            }
            sessionEndTime = endTimeRaw;

            if (subsession.tags) {
              dayTags = [...new Set([...dayTags, ...subsession.tags])];
            }
            scheduleTags = addTagTo(scheduleTags || [], mainTag);

            const finalSubsession = Object.assign({}, subsession, {
              mainTag,
              id: sessionId.toString(),
              day: dayKey,
              track: timeslot.sessions[sessionIndex].track || day.tracks[sessionIndex],
              startTime,
              endTime,
              duration: getDuration(dayKey, startTime, endTime),
              dateReadable: day.dateReadable,
              speakers: subsession.speakers ? subsession.speakers.map((speakerId) => Object.assign({
                id: speakerId,
              }, speakersRaw[speakerId], {
                sessions: null,
              })) : [],
            });

            subsessions.push(finalSubsession);
            sessions[sessionId] = finalSubsession;
            if (subsession.speakers) {
              speakers = Object.assign({}, speakers, updateSpeakersSessions(speakersRaw, subsession.speakers, finalSubsession));
            }
          }

          let sessionStartGrid = getTimeslotMinutesFromStart(dayKey, day.timeslots[0].startTime, sessionEndTime) / 5;
          let sessionEndGrid = getTimeslotMinutesFromStart(dayKey, day.timeslots[0].startTime, sessionStartTime) / 5 + 1;
          let columnEnd = timeslot.welcome ? 5 : sessionsLen !== 1 ?
            sessionIndex + 2 : Object.keys(extensions).length ? Object.keys(extensions)[0] :
              tracksNumber + 1;

          const start = `${sessionStartGrid} / ${sessionIndex + 1}`;
          const end = `${sessionEndGrid} / ${columnEnd}`;

          if (timeslot.sessions[sessionIndex] && timeslot.sessions[sessionIndex].extend) {
            extensions[sessionIndex + 1] = timeslot.sessions[sessionIndex].extend;
          }

          innnerSessions = [...innnerSessions, {
            gridArea: `${start} / ${end}`,
            items: subsessions,
          }];
        }
      }

      for (const [key, value] of Object.entries(extensions)) {
        if (value === 1) {
          delete extensions[key];
        } else {
          extensions[key] = value - 1;
        }
      }

      timeslots.push(Object.assign({}, timeslot, {
        sessions: innnerSessions,
        gridArea: timeslotGridSize,
      }));
    }

    schedule = Object.assign({}, schedule, {
      days: Object.assign({}, schedule.days, {
        [dayKey]: Object.assign({}, day, {
          timeslots,
          tags: dayTags,
        }),
      }),
    });
  }

  self.postMessage({
    speakers,
    schedule,
    sessions,
  });
}, false);
