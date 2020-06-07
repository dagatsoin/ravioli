/* import { string, object, identifier, getContext, getSnapshot, toInstance } from '../src'

test("Persistent manager handling multiple connections on server.", async function(done) {
  const User = object({
    id: identifier(),
    name: string()
  })

  const db = {
    '000': { id: '000', name: 'Fraktos'},
    '001': { id: '001', name: 'Elwein'}
  }

  /**
   * Mock a read DB query
   *//*
  async function getSnapshotInDB(userId: string): Promise<typeof User['Snapshot']> {
    return new Promise(function(resolve) {
      switch(userId) {
        case '000': 
          // This request will be longer
          setTimeout(function() {
            resolve(db['000'])
          }, 100)
          break

        case '001':
          resolve(db['001'])
          break
      }
    })
  }

  /**
   * Mock a write DB query
   *//*
  async function setSnapshotInDB(userId: string, snapshot: any): Promise<void> {
    return new Promise(function(resolve) {
      switch(userId) {
        case '000': 
          // This request will be longer
          db['000'] = snapshot
          resolve()
          break

        case '001':
          db['001'] = snapshot
          setTimeout(resolve, 50)
          break
      }
    })
  }

  async function updateUserProcess(userId: string, name: string): Promise<void> {
    // read user snapshot
    const user = User.create(await getSnapshotInDB(userId))
    getContext(toInstance(user)).transaction(() => user.name = name)
    // write user snapshot
    await setSnapshotInDB(userId, getSnapshot(user))
  }

  // Simulation of two users updating there name
  await updateUserProcess('000', 'Fraktar')
  await updateUserProcess('001', 'Elwëïn')
  expect(db['000']).toEqual({id: '000', name: 'Fraktar'})
  expect(db['001']).toEqual({id: '001', name: 'Elwëïn'})
  done()
}) */