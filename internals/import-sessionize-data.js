import { initializeFirebase, firestore } from './firebase-config';
import schedule from '../docs/schedule.json';
import speakers from '../docs/speakers.json';

const importSpeakers = () => {
  console.log('\tImporting', Object.values(speakers).length, 'speakers...');

  const batch = firestore.batch();

  Object.values(speakers).forEach((speaker) => {
    const social = [];
    speaker.links.forEach((link) => {
      social.push({
        name: link.title,
        url: link.url,
      });
    });
    const speakerData = {
      firstName: speaker.firstName,
      lastName: speaker.lastName,
      title: speaker.tagLine,
      bio: speaker.bio,
      social: social,
      imageUrl: speaker.profilePicture,
    };
    batch.set(
      firestore.collection('mobileSpeakers').doc(speaker.id),
      speakerData,
    );
  });

  return batch.commit()
    .then((results) => {
      console.log('\tImported data for', results.length, 'speakers');
      return results;
    });
};

const importSessions = () => {
  console.log('\tImporting sessions...');

  const batch = firestore.batch();

  Object.values(schedule).forEach((day) => {
    const rooms = day.rooms;
    rooms.forEach((room, roomIndex) => {
      const sessions = room.sessions;
      sessions.forEach((session) => {
        let tags = [];
        if (session.categories.length > 2) {
          tags = session.categories[2].categoryItems.map(item => item.name);
        }
        const sessionData = {
          title: session.title,
          description: session.description,
          startTime: new Date(session.startsAt),
          endTime: new Date(session.endsAt),
          speakers: session.speakers.map(speaker => speaker.id),
          tags: tags,
          track: `${room.id}`,
          trackIndex: roomIndex,
        };
        batch.set(
          firestore.collection('mobileSessions').doc(session.id),
          sessionData,
        );
      });

      const roomData = {
        name: room.name,
      };
      batch.set(
        firestore.collection('mobileTracks').doc(`${room.id}`),
        roomData,
      );
    });
  });

  return batch.commit()
    .then(results => {
      console.log('\tImported data for', results.length, 'sessions');
      return results;
    });
};

const importSpeakersOld = () => {
  console.log('\tImporting', Object.values(speakers).length, 'speakers...');

  const batch = firestore.batch();

  Object.values(speakers).forEach((speaker, index) => {
    const social = [];
    speaker.links.forEach((link) => {
      social.push({
        name: link.title,
        link: link.url,
        icon: getIconName(link.title),
      });
    });
    const speakerData = {
      featured: true,
      name: `${speaker.firstName} ${speaker.lastName}`,
      title: speaker.tagLine,
      bio: speaker.bio,
      order: index,
      shortBio: speaker.bio,
      socials: social,
      photoUrl: speaker.profilePicture,
    };
    batch.set(
      firestore.collection('speakers').doc(speaker.id),
      speakerData,
    );
  });
  return batch.commit()
    .then((results) => {
      console.log('\tImported data for', results.length, 'speakers');
      return results;
    });
};

function getIconName(title) {
  switch (title) {
    case 'Twitter':
      return 'twitter';
    case 'LinkedIn':
      return 'linkedin';
    default:
      return 'website';
  }
}

const importSessionsOld = () => {
  console.log('\tImporting sessions...');

  const batch = firestore.batch();

  batch.set(
    firestore.collection('sessions').doc('tba'),
    {
      title: 'TBA',
      description: 'In Evaluation',
      speakers: [],
      tags: [],
    },
  );

  Object.values(schedule).forEach((day, dayIndex) => {
    const tracks = Object.values(schedule)[dayIndex].rooms.map(room => room.name);
    let slotArray = [];
    let dateId = '';
    day.timeSlots.forEach((slot) => {
      const sessions = slot.rooms;
      let slotSessions = [];
      let slotStartTime = [];
      let slotEndTime = [];
      let startTime = new Date();
      let emptySlotLength = 0;
      sessions.forEach((sessionExtraData, roomIndex) => {
        const session = sessionExtraData.session;

        while (emptySlotLength + roomIndex < tracks.length && sessionExtraData.name !== tracks[emptySlotLength + roomIndex++]) {
          slotSessions.push({
            items: ['tba'],
          });
          emptySlotLength++;
        }

        let tags = [];
        if (session.categories.length > 2) {
          tags = session.categories[2].categoryItems.map(item => item.name);
        }
        const sessionData = {
          title: session.title,
          description: session.description,
          speakers: session.speakers.map(speaker => speaker.id),
          tags: tags,
        };
        batch.set(
          firestore.collection('sessions').doc(session.id),
          sessionData,
        );
        slotSessions.push({
          items: [session.id],
        });
        startTime = new Date(session.startsAt);
        slotStartTime = `${startTime.getHours()}:${(startTime.getMinutes() < 10 ? '0' : '')}${startTime.getMinutes()}`;
        const endTime = new Date(session.endsAt);
        slotEndTime = `${endTime.getHours()}:${(endTime.getMinutes() < 10 ? '0' : '')}${endTime.getMinutes()}`;
      });

      while (tracks.length > slotSessions.length) {
        slotSessions.push({
          items: ['tba'],
        });
      }

      dateId = `${startTime.getFullYear()}-${(startTime.getMonth() < 10 ? '0' : '')}${startTime.getMonth()}-${(startTime.getDate() < 10 ? '0' : '')}${startTime.getDate()}`;
      const options = { month: 'long', day: 'numeric' };
      const readable = startTime.toLocaleDateString('en-US', options);

      batch.set(
        firestore.collection('schedule').doc(dateId),
        { date: dateId },
      );
      batch.update(
        firestore.collection('schedule').doc(dateId),
        { dateReadable: readable },
      );

      slotArray.push({
        startTime: slotStartTime,
        endTime: slotEndTime,
        sessions: slotSessions,
      });
    });
    batch.update(
      firestore.collection('schedule').doc(dateId),
      {
        timeslots: slotArray,
        tracks: tracks,
      },
    );
  });

  return batch.commit()
    .then(results => {
      console.log('\tImported data for', results.length, 'sessions');
      return results;
    });
};

initializeFirebase()
  .then(() => importSpeakersOld())
  .then(() => importSessionsOld())
  .then(() => {
    console.log('Finished');
    process.exit();
  })
  .catch(err => {
    console.log(err);
    process.exit();
  });
