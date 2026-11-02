import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { styles } from '../../../theme/styles';
import { CaseDetail, CaseOpinion } from '../../../types';
import { fetchCaseMtbIds, fetchOpinions, fetchQuestions, submitOpinion, submitQuestion } from '../../../lib/api/opinions';
import { errorMessage } from '../../../lib/api/config';
import { Button, ErrorBox, Field } from '../../../components/ui';

export function OpinionsTab({
  record,
  userId,
  mtbId,
}: {
  record: CaseDetail;
  userId: string;
  mtbId: string | null;
}) {
  const [questions, setQuestions] = useState(record.questions ?? []);
  const [opinions, setOpinions] = useState<CaseOpinion[]>(record.opinions ?? []);
  const [question, setQuestion] = useState('');
  const [comment, setComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [boardId, setBoardId] = useState(mtbId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [boards, questionRows, opinionRows] = await Promise.all([
          fetchCaseMtbIds(record.id),
          fetchQuestions(record.id),
          fetchOpinions(record.id, mtbId),
        ]);
        if (!alive) return;
        if (!boardId) setBoardId(boards[0] ?? null);
        setQuestions(questionRows);
        setOpinions(opinionRows);
        setError('');
      } catch (e) {
        if (alive) setError(errorMessage(e, 'Could not load opinions.'));
      }
    })();
    return () => { alive = false; };
  }, [record.id, mtbId]);

  const postQuestion = async () => {
    if (!question.trim()) return;
    setBusy(true);
    setError('');
    try {
      await submitQuestion(record.id, question);
      setQuestion('');
      setQuestions(await fetchQuestions(record.id));
    } catch (e) {
      setError(errorMessage(e, 'Could not post the question.'));
    } finally {
      setBusy(false);
    }
  };

  const postOpinion = async () => {
    if (!comment.trim()) return;
    if (!boardId) return setError('Opinions require the case to be shared with an MTB.');
    setBusy(true);
    setError('');
    try {
      const data = await submitOpinion({
        caseId: record.id,
        userId,
        text: comment,
        mtbId: boardId,
        parentId: replyTo,
      });
      setOpinions((previous) => [...previous, data]);
      setComment('');
      setReplyTo(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not post the opinion.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Questions for the board</Text>
      {questions.map((item) => (
        <View key={item.id} style={styles.questionCard}>
          <MessageCircle size={16} color="#4A90E2" />
          <Text style={styles.bodyText}>{item.question_text}</Text>
        </View>
      ))}
      <Field label="Ask a question" value={question} onChangeText={setQuestion} multiline placeholder="Type a question for the MTB" />
      <Button title="Post question" secondary onPress={() => void postQuestion()} disabled={busy} />
      <Text style={styles.sectionTitle}>Opinions and replies</Text>
      {opinions.length ? (
        opinions.map((item) => (
          <View key={item.id} style={[styles.opinion, item.parent_id && styles.opinionReply]}>
            <Text style={styles.bodyText}>{item.opinion_text}</Text>
            <Text style={styles.muted}>{new Date(item.created_at).toLocaleString()}</Text>
            {!item.parent_id && (
              <Pressable
                onPress={() => {
                  setReplyTo(item.id);
                  setComment('');
                }}
              >
                <Text style={styles.link}>Reply</Text>
              </Pressable>
            )}
          </View>
        ))
      ) : (
        <Text style={styles.muted}>No opinions yet.</Text>
      )}
      {replyTo && (
        <Text style={styles.muted}>
          Replying to an opinion{' '}
          <Pressable onPress={() => setReplyTo(null)}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
        </Text>
      )}
      <Field
        label={replyTo ? 'Your reply' : 'Add an opinion'}
        value={comment}
        onChangeText={setComment}
        multiline
        placeholder="Share your clinical opinion"
      />
      {error ? <ErrorBox message={error} /> : null}
      <Button
        title={busy ? 'Posting…' : replyTo ? 'Post reply' : 'Post opinion'}
        onPress={() => void postOpinion()}
        disabled={busy}
      />
    </View>
  );
}
