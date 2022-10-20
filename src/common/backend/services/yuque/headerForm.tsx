import { Form } from '@ant-design/compatible';
import '@ant-design/compatible/assets/index.less';
import { Input, TreeSelect } from 'antd';
import { FormComponentProps } from '@ant-design/compatible/lib/form';
import React, { Fragment } from 'react';
import locales from '@/common/locales';
import backend from 'common/backend';
import eventBus from 'common/event';
import { FormattedMessage } from 'react-intl';

const HeaderForm: React.FC<FormComponentProps> = ({ form: { getFieldDecorator } }) => {
  const service = backend.getDocumentService();
  // @ts-ignore
  const tocs = service.tocs;

  const onSelect = function(value: string) {
    // @ts-ignore
    eventBus.emit('repository', value.split('|')[1]);
  };
  return (
    <Fragment>
      <Form.Item>
        {getFieldDecorator('slug', {
          rules: [
            {
              pattern: /^[\w-.]{2,190}$/,
              message: locales.format({
                id: 'backend.services.yuque.headerForm.slug_error',
              }),
            },
          ],
        })(
          <Input
            autoComplete="off"
            placeholder={locales.format({
              id: 'backend.services.yuque.headerForm.slug',
            })}
          />
        )}
      </Form.Item>
      <Form.Item
        label={
          <FormattedMessage id="backend.services.yuque.form.path" defaultMessage="document path" />
        }
      >
        {getFieldDecorator('path', {
          initialValue: tocs,
          rules: [{ required: true, message: 'path is required!' }],
        })(
          <TreeSelect
            style={{ width: '100%' }}
            dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
            onSelect={onSelect}
            treeData={tocs}
            placeholder="请选择"
            treeDefaultExpandAll
          />
        )}
      </Form.Item>
    </Fragment>
  );
};

export default HeaderForm;
