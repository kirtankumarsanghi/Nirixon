const px = (id: number, q = "dpr=2&h=650&w=940") =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&${q}`;

export const PHOTO = {
  // warm wooden-blocks close-up — used to fill giant headline letters
  blocks: px(7269693, "fit=crop&h=700&w=1400"),
  blocksGirl: px(8504538, "fit=crop&h=900&w=1400"),
  motherChild: px(4868392),
  nurses: px(35837132),
  women: px(20356787),
  doctor: px(5998457),
  girl: px(20556415),
  school: px(39122597),
  festival: px(34783845),
  checkup: px(5998445),
};
