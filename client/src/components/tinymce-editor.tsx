import { useMemo, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface TinyMCEEditorProps {
  value: string;
  onEditorChange: (content: string) => void;
  height?: number;
  placeholder?: string;
}

export function TinyMCEEditor({ value, onEditorChange, height = 500, placeholder }: TinyMCEEditorProps) {
  const quillRef = useRef<ReactQuill | null>(null);

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, 4, 5, 6, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ script: 'sub' }, { script: 'super' }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ indent: '-1' }, { indent: '+1' }],
          [{ align: [] }],
          ['blockquote', 'code-block'],
          ['link', 'image', 'video'],
          ['clean'],
        ],
        handlers: {
          image: () => {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            input.onchange = () => {
              const file = input.files?.[0];
              if (!file) return;

              const reader = new FileReader();
              reader.onload = () => {
                const quill = quillRef.current?.getEditor();
                const range = quill?.getSelection(true);
                const insertAt = range?.index ?? quill?.getLength() ?? 0;
                if (quill) {
                  // Quill APIs use number for index - @types/quill has incorrect RangeStatic signatures
                  const q = quill as any;
                  q.insertEmbed(insertAt, 'image', reader.result);
                  q.setSelection(insertAt + 1);
                }
              };
              reader.readAsDataURL(file);
            };
            input.click();
          },
        },
      },
    }),
    []
  );

  const formats = [
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    'color',
    'background',
    'script',
    'list',
    'indent',
    'align',
    'blockquote',
    'code-block',
    'link',
    'image',
    'video',
  ];

  return (
    <div style={{ height }}>
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={onEditorChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder || 'Start writing...'}
        style={{ height: '100%' }}
      />
    </div>
  );
}
