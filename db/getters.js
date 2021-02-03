import { publicUserDbs } from '../db/index.js'
import { constructEntryUrl, parseEntryUrl } from '../lib/strings.js'
import { fetchUserId, fetchUserInfo } from '../lib/network.js'
import { fetchAuthor, fetchVotes, fetchCommentCount, fetchComments, fetchFollowerIds } from './util.js'

export async function getPost (db, key, authorId, auth = undefined) {
  const postEntry = await db.posts.get(key)
  if (!postEntry) {
    throw new Error('Post not found')
  }
  postEntry.url = constructEntryUrl(db.url, 'ctzn.network/post', postEntry.key)
  postEntry.author = await fetchAuthor(authorId)
  postEntry.votes = await fetchVotes(postEntry, auth?.userId)
  postEntry.commentCount = await fetchCommentCount(postEntry, auth?.userId)
  return postEntry
}

export async function listPosts (db, opts, authorId, auth = undefined) {
  const entries = await db.posts.list(opts)
  const authorsCache = {}
  for (let entry of entries) {
    entry.url = constructEntryUrl(db.url, 'ctzn.network/post', entry.key)
    entry.author = await fetchAuthor(authorId, authorsCache)
    entry.votes = await fetchVotes(entry, auth?.userId)
    entry.commentCount = await fetchCommentCount(entry, auth?.userId)
  }
  return entries
}

export async function getThread (subjectUrl, auth = undefined) {
  const commentUrls = await fetchComments({url: subjectUrl}, auth?.userId)
  const commentEntries = await fetchIndexedComments(commentUrls, auth?.userId)
  return commentEntriesToThread(commentEntries)
}

export async function listFollowers (userId, auth = undefined) {
  const userInfo = await fetchUserInfo(userId)
  return {
    subject: userInfo,
    followerIds: await fetchFollowerIds(userId, auth?.userId)
  }
}

export async function listFollows (db, opts) {
  const entries = await db.follows.list(opts)
  for (let entry of entries) {
    entry.url = constructEntryUrl(db.url, 'ctzn.network/follow', entry.key)
  }
  return entries
}

async function fetchIndexedComments (commentUrls, userIdxId = undefined) {
  const authorsCache = {}
  const commentEntries = await Promise.all(commentUrls.map(async (commentUrl) => {
    try {
      const {origin, key} = parseEntryUrl(commentUrl)

      const userId = await fetchUserId(origin)
      const publicUserDb = publicUserDbs.get(userId)
      if (!publicUserDb) return undefined

      const commentEntry = await publicUserDb.comments.get(key)
      commentEntry.url = constructEntryUrl(publicUserDb.url, 'ctzn.network/comment', key)
      commentEntry.author = await fetchAuthor(userId, authorsCache)
      commentEntry.votes = await fetchVotes(commentEntry, userIdxId)
      return commentEntry
    } catch (e) {
      console.log(e)
      return undefined
    }
  }))
  return commentEntries.filter(Boolean)
}


function commentEntriesToThread (commentEntries) {
  const commentEntriesByUrl = {}
  commentEntries.forEach(commentEntry => { commentEntriesByUrl[commentEntry.url] = commentEntry })

  const rootCommentEntries = []
  commentEntries.forEach(commentEntry => {
    if (commentEntry.value.parentCommentUrl) {
      let parent = commentEntriesByUrl[commentEntry.value.parentCommentUrl]
      if (!parent) {
        commentEntry.isMissingParent = true
        rootCommentEntries.push(commentEntry)
        return
      }
      if (!parent.replies) {
        parent.replies = []
        parent.replyCount = 0
      }
      parent.replies.push(commentEntry)
      parent.replyCount++
    } else {
      rootCommentEntries.push(commentEntry)
    }
  })
  return rootCommentEntries
}