import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MessageCircle, ThumbsUp } from 'lucide-react-native';
import { styles } from '../../../theme/styles';
import { CaseDetail, CaseOpinion } from '../../../types';
import {
  fetchOpinions,
  fetchQuestions,
  submitOpinion,
  submitQuestion,
  updateOpinion,
} from '../../../lib/api/opinions';
import { fetchCaseSharedMtbs } from '../../../lib/api/mtbs';
import { errorMessage } from '../../../lib/api/config';
import { Button, ErrorBox, Field, Loading, Pill } from '../../../components/ui';

const byCreated = (a: CaseOpinion, b: CaseOpinion) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

/** Web parity: "You" / "Case Owner" / "Anonymous XX" — never a real name. */
function authorLabel(opinion: CaseOpinion, userId: string, ownerId?: string) {
  if (opinion.user_id === userId) return 'You';
  if (ownerId && opinion.user_id === ownerId) return 'Case Owner';
  return `Anonymous ${(opinion.user_id ?? '').slice(-2)}`;
}

function timeAgo(dateStr: string) {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function OpinionCommentView({
  opinion,
  allOpinions,
  depth,
  userId,
  ownerId,
  canReply,
  onReply,
  onEdit,
  error,
}: {
  opinion: CaseOpinion;
  allOpinions: CaseOpinion[];
  depth: number;
  userId: string;
  ownerId?: string;
  canReply: boolean;
  onReply: (parentId: string, questionId: string | null, content: string) => Promise<void>;
  onEdit: (opinionId: string, text: string) => Promise<void>;
  error: (message: string) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(opinion.opinion_text);

  const isOwn = opinion.user_id === userId;
  const replies = allOpinions.filter((row) => row.parent_id === opinion.id).sort(byCreated);

  const submitReply = async () => {
    if (!replyText.trim() || busy) return;
    setBusy(true);
    try {
      await onReply(opinion.id, opinion.question_id, replyText);
      setReplyText('');
      setReplying(false);
    } catch (e) {
      error(errorMessage(e, 'Could not post the reply.'));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editText.trim() || busy) return;
    setBusy(true);
    try {
      await onEdit(opinion.id, editText);
      setEditing(false);
    } catch (e) {
      error(errorMessage(e, 'Could not update the opinion.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.opinion, depth > 0 && styles.opinionReply]}>
      <Text style={styles.label}>{authorLabel(opinion, userId, ownerId)}</Text>
      {editing ? (
        <>
          <Field label="Edit opinion" value={editText} onChangeText={setEditText} multiline editable />
          <View style={styles.row}>
            <Pill label={busy ? 'Saving…' : 'Save'} active onPress={() => void saveEdit()} disabled={busy} />
            <Pill label="Cancel" onPress={() => { setEditing(false); setEditText(opinion.opinion_text); }} disabled={busy} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.bodyText}>{opinion.opinion_text}</Text>
          <View style={styles.rowBetween}>
            <Text style={styles.muted}>{timeAgo(opinion.created_at)}</Text>
            <Pressable onPress={() => setLiked((prev) => !prev)} style={styles.row}>
              <ThumbsUp size={13} color={liked ? '#4A90E2' : '#9ca3af'} fill={liked ? '#4A90E2' : 'none'} />
              <Text style={styles.muted}>{liked ? 1 : 0}</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            {canReply && (
              <Pressable onPress={() => setReplying((prev) => !prev)}>
                <Text style={styles.link}>Reply</Text>
              </Pressable>
            )}
            {isOwn && (
              <Pressable onPress={() => setEditing(true)}>
                <Text style={styles.link}>Edit</Text>
              </Pressable>
            )}
          </View>
        </>
      )}
      {replying && (
        <>
          <Field label="Your reply" value={replyText} onChangeText={setReplyText} multiline placeholder="Write your reply…" editable />
          <View style={styles.row}>
            <Pill label={busy ? 'Posting…' : 'Post reply'} active onPress={() => void submitReply()} disabled={busy} />
            <Pill label="Cancel" onPress={() => { setReplying(false); setReplyText(''); }} disabled={busy} />
          </View>
        </>
      )}
      {replies.map((reply) => (
        <OpinionCommentView
          key={reply.id}
          opinion={reply}
          allOpinions={allOpinions}
          depth={depth + 1}
          userId={userId}
          ownerId={ownerId}
          canReply={canReply}
          onReply={onReply}
          onEdit={onEdit}
          error={error}
        />
      ))}
    </View>
  );
}

export function OpinionsTab({
  record,
  userId,
  mtbId,
  editable,
}: {
  record: CaseDetail;
  userId: string;
  mtbId: string | null;
  editable: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState(record.questions ?? []);
  const [opinions, setOpinions] = useState<CaseOpinion[]>(record.opinions ?? []);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [boardId, setBoardId] = useState(mtbId);
  const [question, setQuestion] = useState('');
  const [comment, setComment] = useState('');
  const [answerFor, setAnswerFor] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canPost = Boolean(boardId);

  // Boards + questions once per case.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [boardRows, questionRows] = await Promise.all([
          fetchCaseSharedMtbs(record.id),
          fetchQuestions(record.id),
        ]);
        if (!alive) return;
        setBoards(boardRows);
        setQuestions(questionRows);
        setError('');
      } catch (e) {
        if (alive) setError(errorMessage(e, 'Could not load opinions.'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [record.id]);

  // Default the opinion context to the MTB we were opened from, else the first
  // board the case is shared with.
  useEffect(() => {
    if (!boardId && boards.length) setBoardId(mtbId ?? boards[0].id);
  }, [boards, boardId, mtbId]);

  // Opinions for the active MTB context (with legacy fallback in fetchOpinions).
  useEffect(() => {
    let alive = true;
    void fetchOpinions(record.id, boardId)
      .then((rows) => { if (alive) setOpinions(rows); })
      .catch((e) => { if (alive) setError(errorMessage(e, 'Could not load opinions.')); });
    return () => { alive = false; };
  }, [record.id, boardId]);

  const refreshQuestions = async () => setQuestions(await fetchQuestions(record.id));

  const postQuestion = async () => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await submitQuestion(record.id, question);
      setQuestion('');
      await refreshQuestions();
    } catch (e) {
      setError(errorMessage(e, 'Could not post the question.'));
    } finally {
      setBusy(false);
    }
  };

  const postOpinion = async (text: string, questionId: string | null, parentId: string | null) => {
    if (!boardId) throw new Error('Select an MTB context to post opinions.');
    const row = await submitOpinion({
      caseId: record.id,
      userId,
      text,
      mtbId: boardId,
      parentId,
      questionId,
    });
    setOpinions((previous) => [...previous, row]);
  };

  const submitGeneral = async () => {
    if (!comment.trim() || busy) return;
    if (!canPost) return setError('Select an MTB context to post opinions.');
    setBusy(true);
    setError('');
    try {
      await postOpinion(comment, null, null);
      setComment('');
    } catch (e) {
      setError(errorMessage(e, 'Could not post the opinion.'));
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = async (questionId: string) => {
    if (!answerText.trim() || busy) return;
    if (!canPost) return setError('Select an MTB context to post opinions.');
    setBusy(true);
    setError('');
    try {
      await postOpinion(answerText, questionId, null);
      setAnswerText('');
      setAnswerFor(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not post the answer.'));
    } finally {
      setBusy(false);
    }
  };

  const editOpinion = async (opinionId: string, text: string) => {
    await updateOpinion(opinionId, text);
    setOpinions((previous) =>
      previous.map((row) => (row.id === opinionId ? { ...row, opinion_text: text.trim() } : row)),
    );
  };

  const reply = async (parentId: string, questionId: string | null, content: string) => {
    if (!canPost) throw new Error('Select an MTB context to post replies.');
    // Replies inherit the parent's MTB (web parity) — fall back to the active one.
    const parent = opinions.find((row) => row.id === parentId);
    const row = await submitOpinion({
      caseId: record.id,
      userId,
      text: content,
      mtbId: parent?.mtb_id ?? boardId!,
      parentId,
      questionId,
    });
    setOpinions((previous) => [...previous, row]);
  };

  if (loading) return <Loading label="Loading opinions…" />;

  const generalOpinions = opinions
    .filter((row) => !row.question_id && !row.parent_id)
    .sort(byCreated);

  return (
    <View>
      {boards.length > 1 && editable && (
        <View style={styles.filterRow}>
          <Text style={styles.muted}>MTB:</Text>
          {boards.map((board) => (
            <Pill
              key={board.id}
              label={board.name}
              active={boardId === board.id}
              onPress={() => setBoardId(board.id)}
            />
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>Specific Questions</Text>
      {editable && (
        <>
          <Field
            label="Ask a question"
            value={question}
            onChangeText={setQuestion}
            multiline
            placeholder="Type a question for the MTB"
          />
          <Button title="Post question" secondary onPress={() => void postQuestion()} disabled={busy} />
        </>
      )}
      {questions.length ? (
        questions.map((item) => {
          const answers = opinions
            .filter((row) => row.question_id === item.id && !row.parent_id)
            .sort(byCreated);
          return (
            <View key={item.id} style={styles.questionCard}>
              <View style={styles.row}>
                <MessageCircle size={16} color="#4A90E2" />
                <Text style={styles.bodyText}>{item.question_text}</Text>
              </View>
              <View style={styles.filterRow}>
                <Pill label="Clinical" active />
                <Text style={styles.muted}>Asked by Case Owner</Text>
              </View>
              {answers.length ? (
                answers.map((answer) => (
                  <OpinionCommentView
                    key={answer.id}
                    opinion={answer}
                    allOpinions={opinions}
                    depth={0}
                    userId={userId}
                    ownerId={record.owner_id}
                    canReply={canPost}
                    onReply={reply}
                    onEdit={editOpinion}
                    error={setError}
                  />
                ))
              ) : (
                <Text style={styles.muted}>No answers yet.</Text>
              )}
              {canPost && (
                <>
                  <Field
                    label="Your answer"
                    value={answerFor === item.id ? answerText : ''}
                    onChangeText={(text) => {
                      setAnswerFor(item.id);
                      setAnswerText(text);
                    }}
                    multiline
                    placeholder="Write your answer…"
                    editable
                  />
                  <Button
                    title={busy ? 'Posting…' : 'Answer'}
                    secondary
                    onPress={() => void submitAnswer(item.id)}
                    disabled={busy || answerFor !== item.id || !answerText.trim()}
                  />
                </>
              )}
            </View>
          );
        })
      ) : (
        <Text style={styles.muted}>
          {editable
            ? 'No questions yet. Add questions to guide expert discussions.'
            : 'No questions have been added by the case owner yet.'}
        </Text>
      )}

      <Text style={styles.sectionTitle}>Opinions and replies</Text>
      {generalOpinions.length ? (
        generalOpinions.map((item) => (
          <OpinionCommentView
            key={item.id}
            opinion={item}
            allOpinions={opinions}
            depth={0}
            userId={userId}
            ownerId={record.owner_id}
            canReply={canPost}
            onReply={reply}
            onEdit={editOpinion}
            error={setError}
          />
        ))
      ) : (
        <Text style={styles.muted}>No discussions yet in this MTB.</Text>
      )}

      <Field
        label="Add an opinion"
        value={comment}
        onChangeText={setComment}
        multiline
        placeholder="Share your clinical opinion"
        editable={canPost}
      />
      {error ? <ErrorBox message={error} /> : null}
      <Button
        title={busy ? 'Posting…' : 'Post opinion'}
        onPress={() => void submitGeneral()}
        disabled={busy || !canPost || !comment.trim()}
      />
      {!canPost && <Text style={styles.muted}>Select an MTB context to post opinions.</Text>}
    </View>
  );
}
